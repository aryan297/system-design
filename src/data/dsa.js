export const DSA_CATEGORIES = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Arrays + Two Pointers
  // ─────────────────────────────────────────────────────────────────────────
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
          "Given an array of integers nums and an integer target, return indices of the two numbers that add up to target. Exactly one solution exists; you cannot use the same element twice.",
        examples: [
          { input: "nums = [2,7,11,15], target = 9", output: "[0 1]", explanation: "nums[0] + nums[1] = 2 + 7 = 9" },
          { input: "nums = [3,2,4], target = 6",      output: "[1 2]", explanation: "nums[1] + nums[2] = 2 + 4 = 6" },
        ],
        approach:
          "Use a hash map to store each number's index as you iterate. For every element, check if (target − element) already exists in the map. If yes, return the stored index and the current index. This avoids the O(n²) brute-force nested loop.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func twoSum(nums []int, target int) []int {
	seen := make(map[int]int) // value → index
	for i, n := range nums {
		complement := target - n
		if j, ok := seen[complement]; ok {
			return []int{j, i}
		}
		seen[n] = i
	}
	return nil
}

func main() {
	nums := []int{2, 7, 11, 15}
	target := 9
	result := twoSum(nums, target)
	fmt.Println(result)
	// Output: [0 1]

	nums2 := []int{3, 2, 4}
	result2 := twoSum(nums2, 6)
	fmt.Println(result2)
	// Output: [1 2]
}`,
      },
      {
        id: "two-sum-ii",
        title: "Two Sum II – Input Array Is Sorted",
        difficulty: "Medium",
        leetcode: 167,
        description:
          "Given a 1-indexed array of integers numbers that is already sorted in non-decreasing order, find two numbers that add up to target. Return their indices (1-indexed) as [index1, index2]. Exactly one solution exists; you may not use the same element twice.",
        examples: [
          { input: "numbers = [2,7,11,15], target = 9", output: "[1 2]", explanation: "numbers[0] + numbers[1] = 2 + 7 = 9, return [1, 2]" },
          { input: "numbers = [2,3,4], target = 6",     output: "[1 3]", explanation: "numbers[0] + numbers[2] = 2 + 4 = 6, return [1, 3]" },
          { input: "numbers = [-1,0], target = -1",     output: "[1 2]", explanation: "numbers[0] + numbers[1] = -1 + 0 = -1, return [1, 2]" },
        ],
        approach:
          "Because the array is sorted, use two pointers starting at both ends. If their sum equals target, return their 1-based indices. If the sum is too small, advance the left pointer to increase it; if too large, retreat the right pointer to decrease it. No extra space needed — the sorted order guarantees convergence.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func twoSumII(numbers []int, target int) []int {
	left, right := 0, len(numbers)-1
	for left < right {
		sum := numbers[left] + numbers[right]
		if sum == target {
			return []int{left + 1, right + 1} // 1-indexed
		} else if sum < target {
			left++
		} else {
			right--
		}
	}
	return nil
}

func main() {
	fmt.Println(twoSumII([]int{2, 7, 11, 15}, 9))
	// Output: [1 2]

	fmt.Println(twoSumII([]int{2, 3, 4}, 6))
	// Output: [1 3]

	fmt.Println(twoSumII([]int{-1, 0}, -1))
	// Output: [1 2]
}`,
      },
      {
        id: "container-with-most-water",
        title: "Container With Most Water",
        difficulty: "Medium",
        leetcode: 11,
        description:
          "Given n non-negative integers representing heights of vertical lines, find two lines that together with the x-axis form a container holding the most water.",
        examples: [
          { input: "height = [1,8,6,2,5,4,8,3,7]", output: "49", explanation: "Lines at index 1 (h=8) and index 8 (h=7), width=7, area=49" },
          { input: "height = [1,1]",                output: "1",  explanation: "Only two lines, area = 1" },
        ],
        approach:
          "Start with two pointers at both ends. Area = width × min(left, right). Always move the pointer with the shorter height inward — moving the taller one can never increase area since width shrinks.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func maxArea(height []int) int {
	left, right := 0, len(height)-1
	best := 0
	for left < right {
		h := height[left]
		if height[right] < h {
			h = height[right]
		}
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

func main() {
	height := []int{1, 8, 6, 2, 5, 4, 8, 3, 7}
	fmt.Println(maxArea(height))
	// Output: 49

	height2 := []int{1, 1}
	fmt.Println(maxArea(height2))
	// Output: 1
}`,
      },
      {
        id: "three-sum",
        title: "3Sum",
        difficulty: "Medium",
        leetcode: 15,
        description:
          "Given an integer array nums, return all unique triplets [nums[i], nums[j], nums[k]] such that i, j, k are distinct and their sum is 0.",
        examples: [
          { input: "nums = [-1,0,1,2,-1,-4]", output: "[[-1 -1 2] [-1 0 1]]", explanation: "Two unique triplets summing to zero" },
          { input: "nums = [0,0,0]",           output: "[[0 0 0]]",            explanation: "Only one unique triplet" },
        ],
        approach:
          "Sort the array. Fix one element with an outer loop, then run two pointers on the remaining subarray to find pairs that sum to its negation. Skip duplicate values at both levels to avoid duplicate triplets.",
        complexity: { time: "O(n²)", space: "O(1)" },
        code: `package main

import (
	"fmt"
	"sort"
)

func threeSum(nums []int) [][]int {
	sort.Ints(nums)
	result := [][]int{}
	for i := 0; i < len(nums)-2; i++ {
		if i > 0 && nums[i] == nums[i-1] {
			continue
		}
		left, right := i+1, len(nums)-1
		for left < right {
			sum := nums[i] + nums[left] + nums[right]
			if sum == 0 {
				result = append(result, []int{nums[i], nums[left], nums[right]})
				for left < right && nums[left] == nums[left+1] {
					left++
				}
				for left < right && nums[right] == nums[right-1] {
					right--
				}
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
}

func main() {
	fmt.Println(threeSum([]int{-1, 0, 1, 2, -1, -4}))
	// Output: [[-1 -1 2] [-1 0 1]]

	fmt.Println(threeSum([]int{0, 0, 0}))
	// Output: [[0 0 0]]
}`,
      },
      {
        id: "move-zeroes",
        title: "Move Zeroes",
        difficulty: "Easy",
        leetcode: 283,
        description:
          "Given an integer array nums, move all zeroes to the end in-place while maintaining the relative order of non-zero elements.",
        examples: [
          { input: "nums = [0,1,0,3,12]", output: "[1 3 12 0 0]", explanation: "Non-zeroes keep order; zeroes go to end" },
          { input: "nums = [0]",          output: "[0]",           explanation: "Single zero, no change" },
        ],
        approach:
          "Use a write pointer (insert) starting at 0. Scan with a fast pointer: whenever nums[fast] != 0, swap nums[insert] and nums[fast], then advance insert. All positions after insert are implicitly zeroed.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func moveZeroes(nums []int) {
	insert := 0
	for fast := 0; fast < len(nums); fast++ {
		if nums[fast] != 0 {
			nums[insert], nums[fast] = nums[fast], nums[insert]
			insert++
		}
	}
}

func main() {
	nums := []int{0, 1, 0, 3, 12}
	moveZeroes(nums)
	fmt.Println(nums)
	// Output: [1 3 12 0 0]

	nums2 := []int{0}
	moveZeroes(nums2)
	fmt.Println(nums2)
	// Output: [0]
}`,
      },
      {
        id: "sort-colors",
        title: "Sort Colors",
        difficulty: "Medium",
        leetcode: 75,
        description:
          "Given an array of 0s, 1s, and 2s, sort them in-place so the same colors are adjacent in order 0, 1, 2 — without using sort.",
        examples: [
          { input: "nums = [2,0,2,1,1,0]", output: "[0 0 1 1 2 2]", explanation: "Dutch National Flag partitions into three sections" },
          { input: "nums = [2,0,1]",       output: "[0 1 2]",        explanation: "Single pass places each element correctly" },
        ],
        approach:
          "Dutch National Flag: maintain low (next 0 slot), mid (cursor), high (next 2 slot). If nums[mid]==0 swap with low, advance both. If 2 swap with high, retreat high only (re-check mid). If 1 just advance mid.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func sortColors(nums []int) {
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
			// don't advance mid; re-examine the swapped element
		}
	}
}

func main() {
	nums := []int{2, 0, 2, 1, 1, 0}
	sortColors(nums)
	fmt.Println(nums)
	// Output: [0 0 1 1 2 2]

	nums2 := []int{2, 0, 1}
	sortColors(nums2)
	fmt.Println(nums2)
	// Output: [0 1 2]
}`,
      },
      {
        id: "trapping-rain-water",
        title: "Trapping Rain Water",
        difficulty: "Hard",
        leetcode: 42,
        description:
          "Given n non-negative integers representing an elevation map (bar width = 1), compute how much water can be trapped after raining.",
        examples: [
          { input: "height = [0,1,0,2,1,0,1,3,2,1,2,1]", output: "6", explanation: "6 units trapped in the valleys" },
          { input: "height = [4,2,0,3,2,5]",              output: "9", explanation: "9 units trapped" },
        ],
        approach:
          "Two pointers with leftMax and rightMax. Water above a cell = min(leftMax, rightMax) − height[cell]. Move the pointer on the side with the smaller max — that side's wall is the bottleneck. No extra arrays needed.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func trap(height []int) int {
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
}

func main() {
	fmt.Println(trap([]int{0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1}))
	// Output: 6

	fmt.Println(trap([]int{4, 2, 0, 3, 2, 5}))
	// Output: 9
}`,
      },
      {
        id: "remove-duplicates-sorted-array",
        title: "Remove Duplicates from Sorted Array",
        difficulty: "Easy",
        leetcode: 26,
        description:
          "Given a sorted array, remove duplicates in-place so each unique element appears once. Return k — the count of unique elements.",
        examples: [
          { input: "nums = [1,1,2]",             output: "2, nums = [1,2,_]",           explanation: "2 unique elements" },
          { input: "nums = [0,0,1,1,1,2,2,3,3,4]", output: "5, nums = [0,1,2,3,4,...]", explanation: "5 unique elements at front" },
        ],
        approach:
          "Write pointer k starts at 1. Iterate from index 1: whenever nums[i] != nums[i-1], it's a new unique value — write it at nums[k] and advance k. Sorted array guarantees duplicates are adjacent.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func removeDuplicates(nums []int) int {
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
}

func main() {
	nums := []int{1, 1, 2}
	k := removeDuplicates(nums)
	fmt.Println(k, nums[:k])
	// Output: 2 [1 2]

	nums2 := []int{0, 0, 1, 1, 1, 2, 2, 3, 3, 4}
	k2 := removeDuplicates(nums2)
	fmt.Println(k2, nums2[:k2])
	// Output: 5 [0 1 2 3 4]
}`,
      },
      {
        id: "valid-palindrome",
        title: "Valid Palindrome",
        difficulty: "Easy",
        leetcode: 125,
        description:
          "After lowercasing and removing non-alphanumeric characters, check if a string reads the same forward and backward.",
        examples: [
          { input: 's = "A man, a plan, a canal: Panama"', output: "true",  explanation: '"amanaplanacanalpanama" is a palindrome' },
          { input: 's = "race a car"',                     output: "false", explanation: '"raceacar" is not a palindrome' },
        ],
        approach:
          "Two pointers at opposite ends. Skip non-alphanumeric characters. Compare lowercased characters — if they ever differ return false. If pointers cross, return true.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func isPalindrome(s string) bool {
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
}

func main() {
	fmt.Println(isPalindrome("A man, a plan, a canal: Panama"))
	// Output: true

	fmt.Println(isPalindrome("race a car"))
	// Output: false
}`,
      },
      {
        id: "product-except-self",
        title: "Product of Array Except Self",
        difficulty: "Medium",
        leetcode: 238,
        description:
          "Return an array where answer[i] equals the product of all elements except nums[i]. Solve in O(n) without division.",
        examples: [
          { input: "nums = [1,2,3,4]",       output: "[24 12 8 6]", explanation: "Each element replaced by product of all others" },
          { input: "nums = [-1,1,0,-3,3]",   output: "[0 0 9 0 0]", explanation: "Zero propagates across most positions" },
        ],
        approach:
          "Two passes. Pass 1: fill answer[i] with prefix product of everything left of i. Pass 2: scan right-to-left with a running suffix product, multiply it into answer[i]. No extra array needed.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func productExceptSelf(nums []int) []int {
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
}

func main() {
	fmt.Println(productExceptSelf([]int{1, 2, 3, 4}))
	// Output: [24 12 8 6]

	fmt.Println(productExceptSelf([]int{-1, 1, 0, -3, 3}))
	// Output: [0 0 9 0 0]
}`,
      },
      {
        id: "find-duplicate-number",
        title: "Find the Duplicate Number",
        difficulty: "Medium",
        leetcode: 287,
        description:
          "Array of n+1 integers in [1,n] with exactly one duplicate. Find it without modifying the array, using O(1) extra space.",
        examples: [
          { input: "nums = [1,3,4,2,2]", output: "2", explanation: "2 appears twice" },
          { input: "nums = [3,1,3,4,2]", output: "3", explanation: "3 appears twice" },
        ],
        approach:
          "Treat the array as a linked list where i → nums[i]. The duplicate creates a cycle. Floyd's algorithm: Phase 1 — slow moves 1 step, fast 2 steps until they meet. Phase 2 — reset slow to 0, both move 1 step — they meet at the duplicate.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func findDuplicate(nums []int) int {
	// Phase 1: find intersection inside the cycle
	slow, fast := nums[0], nums[nums[0]]
	for slow != fast {
		slow = nums[slow]
		fast = nums[nums[fast]]
	}
	// Phase 2: find entry point of the cycle (the duplicate)
	slow = 0
	for slow != fast {
		slow = nums[slow]
		fast = nums[fast]
	}
	return slow
}

func main() {
	fmt.Println(findDuplicate([]int{1, 3, 4, 2, 2}))
	// Output: 2

	fmt.Println(findDuplicate([]int{3, 1, 3, 4, 2}))
	// Output: 3
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Sliding Window
  // ─────────────────────────────────────────────────────────────────────────
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
          "Given prices[i] as stock price on day i, return the maximum profit from one buy-then-sell. Return 0 if no profit is possible.",
        examples: [
          { input: "prices = [7,1,5,3,6,4]", output: "5", explanation: "Buy day 2 (price 1), sell day 5 (price 6), profit = 5" },
          { input: "prices = [7,6,4,3,1]",   output: "0", explanation: "Prices only decrease — no profitable trade" },
        ],
        approach:
          "Slide a window: left = best buy day, right = current day. Track the minimum price seen so far. At each step profit = price − minPrice. If price drops below minPrice, slide the buy day forward.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func maxProfit(prices []int) int {
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
}

func main() {
	fmt.Println(maxProfit([]int{7, 1, 5, 3, 6, 4}))
	// Output: 5

	fmt.Println(maxProfit([]int{7, 6, 4, 3, 1}))
	// Output: 0
}`,
      },
      {
        id: "longest-substring-without-repeating",
        title: "Longest Substring Without Repeating Characters",
        difficulty: "Medium",
        leetcode: 3,
        description:
          "Find the length of the longest substring containing no repeating characters.",
        examples: [
          { input: 's = "abcabcbb"', output: "3", explanation: '"abc" is the longest window with unique chars' },
          { input: 's = "bbbbb"',    output: "1", explanation: 'Only "b" with length 1' },
        ],
        approach:
          "Map each character to its last seen index. Expand right each step. When s[right] is already in the window, jump left to max(left, lastSeen+1). Track the longest window.",
        complexity: { time: "O(n)", space: "O(min(n,m)) where m = charset" },
        code: `package main

import "fmt"

func lengthOfLongestSubstring(s string) int {
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
}

func main() {
	fmt.Println(lengthOfLongestSubstring("abcabcbb"))
	// Output: 3

	fmt.Println(lengthOfLongestSubstring("bbbbb"))
	// Output: 1

	fmt.Println(lengthOfLongestSubstring("pwwkew"))
	// Output: 3
}`,
      },
      {
        id: "minimum-window-substring",
        title: "Minimum Window Substring",
        difficulty: "Hard",
        leetcode: 76,
        description:
          "Return the minimum window in s containing every character of t (including duplicates). Return empty string if none exists.",
        examples: [
          { input: 's = "ADOBECODEBANC", t = "ABC"', output: '"BANC"', explanation: "Shortest window containing A, B, C" },
          { input: 's = "a", t = "aa"',              output: '""',     explanation: "t needs two a's but s has only one" },
        ],
        approach:
          "Two frequency maps: need (counts for t) and window (current). Track formed — unique chars satisfying their count. Expand right to grow; once all satisfied, shrink left to minimize and record best. Repeat.",
        complexity: { time: "O(|s|+|t|)", space: "O(|s|+|t|)" },
        code: `package main

import "fmt"

func minWindow(s string, t string) string {
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
}

func main() {
	fmt.Println(minWindow("ADOBECODEBANC", "ABC"))
	// Output: BANC

	fmt.Println(minWindow("a", "aa"))
	// Output: (empty string)
}`,
      },
      {
        id: "longest-repeating-character-replacement",
        title: "Longest Repeating Character Replacement",
        difficulty: "Medium",
        leetcode: 424,
        description:
          "You can replace at most k characters in any window. Return the length of the longest window that contains only one distinct letter after replacements.",
        examples: [
          { input: 's = "ABAB", k = 2', output: "4", explanation: 'Replace both B\'s → "AAAA"' },
          { input: 's = "AABABBA", k = 1', output: "4", explanation: 'Window "AABA" → replace one B → "AAAA"' },
        ],
        approach:
          "Expand right, track char frequencies and maxFreq in the window. Valid when (windowSize − maxFreq) ≤ k. If invalid, slide left by 1. The window size never shrinks below the best valid size seen.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func characterReplacement(s string, k int) int {
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
}

func main() {
	fmt.Println(characterReplacement("ABAB", 2))
	// Output: 4

	fmt.Println(characterReplacement("AABABBA", 1))
	// Output: 4
}`,
      },
      {
        id: "permutation-in-string",
        title: "Permutation in String",
        difficulty: "Medium",
        leetcode: 567,
        description:
          "Return true if any permutation of s1 is a substring of s2.",
        examples: [
          { input: 's1 = "ab", s2 = "eidbaooo"', output: "true",  explanation: '"ba" is a permutation of "ab" appearing in s2' },
          { input: 's1 = "ab", s2 = "eidboaoo"', output: "false", explanation: "No permutation of s1 appears in s2" },
        ],
        approach:
          "Fixed-size window of len(s1) over s2. Keep two 26-char frequency arrays and count matches (chars where both arrays agree). Slide: update counts for incoming and outgoing chars, adjust matches. Return true when matches == 26.",
        complexity: { time: "O(|s1|+|s2|)", space: "O(1)" },
        code: `package main

import "fmt"

func checkInclusion(s1 string, s2 string) bool {
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
}

func main() {
	fmt.Println(checkInclusion("ab", "eidbaooo"))
	// Output: true

	fmt.Println(checkInclusion("ab", "eidboaoo"))
	// Output: false
}`,
      },
      {
        id: "sliding-window-maximum",
        title: "Sliding Window Maximum",
        difficulty: "Hard",
        leetcode: 239,
        description:
          "Return an array of maximum values for each sliding window of size k moving left to right.",
        examples: [
          { input: "nums = [1,3,-1,-3,5,3,6,7], k = 3", output: "[3 3 5 5 6 7]", explanation: "Max of each consecutive window of size 3" },
          { input: "nums = [1], k = 1",                  output: "[1]",            explanation: "Single element window" },
        ],
        approach:
          "Monotonic decreasing deque of indices. For each element: pop from back while back value ≤ current (stale candidates). Pop from front if outside window. Front is always the max. Emit front once window is full.",
        complexity: { time: "O(n)", space: "O(k)" },
        code: `package main

import "fmt"

func maxSlidingWindow(nums []int, k int) []int {
	deque := []int{} // indices, decreasing by nums value
	result := []int{}

	for right := 0; right < len(nums); right++ {
		// remove indices outside window
		for len(deque) > 0 && deque[0] < right-k+1 {
			deque = deque[1:]
		}
		// maintain decreasing order
		for len(deque) > 0 && nums[deque[len(deque)-1]] <= nums[right] {
			deque = deque[:len(deque)-1]
		}
		deque = append(deque, right)

		if right >= k-1 {
			result = append(result, nums[deque[0]])
		}
	}
	return result
}

func main() {
	fmt.Println(maxSlidingWindow([]int{1, 3, -1, -3, 5, 3, 6, 7}, 3))
	// Output: [3 3 5 5 6 7]

	fmt.Println(maxSlidingWindow([]int{1}, 1))
	// Output: [1]
}`,
      },
      {
        id: "minimum-size-subarray-sum",
        title: "Minimum Size Subarray Sum",
        difficulty: "Medium",
        leetcode: 209,
        description:
          "Given an array of positive integers and a target, return the minimal length of a contiguous subarray with sum ≥ target. Return 0 if none exists.",
        examples: [
          { input: "target = 7, nums = [2,3,1,2,4,3]", output: "2", explanation: "[4,3] sums to 7 with length 2" },
          { input: "target = 4, nums = [1,4,4]",        output: "1", explanation: "[4] alone satisfies the target" },
        ],
        approach:
          "Expand right to grow sum. Once sum ≥ target, record the window length and shrink left to find a smaller valid window. Continue until sum < target, then expand again.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func minSubArrayLen(target int, nums []int) int {
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
}

func main() {
	fmt.Println(minSubArrayLen(7, []int{2, 3, 1, 2, 4, 3}))
	// Output: 2

	fmt.Println(minSubArrayLen(4, []int{1, 4, 4}))
	// Output: 1

	fmt.Println(minSubArrayLen(11, []int{1, 1, 1, 1, 1, 1, 1, 1}))
	// Output: 0 (no valid subarray)
}`,
      },
      {
        id: "find-all-anagrams",
        title: "Find All Anagrams in a String",
        difficulty: "Medium",
        leetcode: 438,
        description:
          "Return all start indices of p's anagrams in s.",
        examples: [
          { input: 's = "cbaebabacd", p = "abc"', output: "[0 6]", explanation: '"cba" at index 0, "bac" at index 6' },
          { input: 's = "abab", p = "ab"',         output: "[0 1 2]", explanation: "Anagrams start at every index" },
        ],
        approach:
          "Fixed-size window of len(p) with two 26-char frequency arrays and a matches counter. Every time matches==26 the current window is an anagram — append left index to result.",
        complexity: { time: "O(|s|+|p|)", space: "O(1)" },
        code: `package main

import "fmt"

func findAnagrams(s string, p string) []int {
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
		if win[in] == need[in] {
			matches++
		} else if win[in] == need[in]+1 {
			matches--
		}
		out := s[right-len(p)] - 'a'
		win[out]--
		if win[out] == need[out] {
			matches++
		} else if win[out] == need[out]-1 {
			matches--
		}
	}
	if matches == 26 {
		result = append(result, len(s)-len(p))
	}
	return result
}

func main() {
	fmt.Println(findAnagrams("cbaebabacd", "abc"))
	// Output: [0 6]

	fmt.Println(findAnagrams("abab", "ab"))
	// Output: [0 1 2]
}`,
      },
      {
        id: "maximum-average-subarray",
        title: "Maximum Average Subarray I",
        difficulty: "Easy",
        leetcode: 643,
        description:
          "Find a contiguous subarray of length exactly k with the maximum average and return that average.",
        examples: [
          { input: "nums = [1,12,-5,-6,50,3], k = 4", output: "12.75", explanation: "Window [12,-5,-6,50] sums to 51, avg = 12.75" },
          { input: "nums = [5], k = 1",               output: "5.0",   explanation: "Single element" },
        ],
        approach:
          "Compute sum of the first k elements. Then slide: add nums[right] and subtract nums[right-k] to maintain the running window sum in O(1). Track the maximum sum and divide by k.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func findMaxAverage(nums []int, k int) float64 {
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
}

func main() {
	fmt.Println(findMaxAverage([]int{1, 12, -5, -6, 50, 3}, 4))
	// Output: 12.75

	fmt.Println(findMaxAverage([]int{5}, 1))
	// Output: 5
}`,
      },
      {
        id: "fruit-into-baskets",
        title: "Fruit Into Baskets",
        difficulty: "Medium",
        leetcode: 904,
        description:
          "You have two baskets (each holds one fruit type). Given fruits[i] as the fruit type at tree i, return the max fruits you can collect from a contiguous subarray with at most 2 distinct types.",
        examples: [
          { input: "fruits = [1,2,1]",   output: "3", explanation: "All three — 2 distinct types" },
          { input: "fruits = [0,1,2,2]", output: "3", explanation: "[1,2,2] — 2 types, length 3" },
        ],
        approach:
          "Sliding window with a frequency map. Expand right adding fruits[right]. When map has > 2 keys, shrink left until only 2 types remain. Track the maximum window size.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func totalFruit(fruits []int) int {
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
}

func main() {
	fmt.Println(totalFruit([]int{1, 2, 1}))
	// Output: 3

	fmt.Println(totalFruit([]int{0, 1, 2, 2}))
	// Output: 3

	fmt.Println(totalFruit([]int{1, 2, 3, 2, 2}))
	// Output: 4
}`,
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // 3. Prefix Sum
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "prefix-sum",
    icon: "➕",
    title: "Prefix Sum",
    problems: [
      {
        id: "running-sum-1d-array",
        title: "Running Sum of 1d Array",
        difficulty: "Easy",
        leetcode: 1480,
        description:
          "Given an array nums, return the running sum where runningSum[i] = sum(nums[0] + ... + nums[i]).",
        examples: [
          { input: "nums = [1,2,3,4]",    output: "[1 3 6 10]", explanation: "Each element adds to the previous sum" },
          { input: "nums = [1,1,1,1,1]",  output: "[1 2 3 4 5]", explanation: "Cumulative count of ones" },
        ],
        approach:
          "Scan left to right. At each index, add the previous element's value into the current element (in-place). This turns the array into its own prefix sum array in one pass.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func runningSum(nums []int) []int {
	for i := 1; i < len(nums); i++ {
		nums[i] += nums[i-1]
	}
	return nums
}

func main() {
	fmt.Println(runningSum([]int{1, 2, 3, 4}))
	// Output: [1 3 6 10]

	fmt.Println(runningSum([]int{1, 1, 1, 1, 1}))
	// Output: [1 2 3 4 5]

	fmt.Println(runningSum([]int{3, 1, 2, 10, 1}))
	// Output: [3 4 6 16 17]
}`,
      },
      {
        id: "range-sum-query",
        title: "Range Sum Query — Immutable",
        difficulty: "Easy",
        leetcode: 303,
        description:
          "Given an integer array, handle multiple queries of the form sumRange(left, right) — return the sum of elements between indices left and right inclusive.",
        examples: [
          { input: "nums = [-2,0,3,-5,2,-1], sumRange(0,2)", output: "1",  explanation: "-2 + 0 + 3 = 1" },
          { input: "sumRange(2,5)",                          output: "-1", explanation: "3 + -5 + 2 + -1 = -1" },
        ],
        approach:
          "Precompute a prefix sum array where prefix[i] = sum of nums[0..i-1]. Then sumRange(l,r) = prefix[r+1] - prefix[l] in O(1). The preprocessing pays off over many queries.",
        complexity: { time: "O(1) query, O(n) build", space: "O(n)" },
        code: `package main

import "fmt"

type NumArray struct {
	prefix []int
}

func Constructor(nums []int) NumArray {
	prefix := make([]int, len(nums)+1)
	for i, v := range nums {
		prefix[i+1] = prefix[i] + v
	}
	return NumArray{prefix}
}

func (na *NumArray) SumRange(left, right int) int {
	return na.prefix[right+1] - na.prefix[left]
}

func main() {
	na := Constructor([]int{-2, 0, 3, -5, 2, -1})

	fmt.Println(na.SumRange(0, 2))
	// Output: 1  (-2+0+3)

	fmt.Println(na.SumRange(2, 5))
	// Output: -1  (3-5+2-1)

	fmt.Println(na.SumRange(0, 5))
	// Output: -3  (sum of all)
}`,
      },
      {
        id: "find-pivot-index",
        title: "Find Pivot Index",
        difficulty: "Easy",
        leetcode: 724,
        description:
          "Return the leftmost index where the sum of all numbers to its left equals the sum of all numbers to its right. Return -1 if no such index exists.",
        examples: [
          { input: "nums = [1,7,3,6,5,6]", output: "3", explanation: "Left sum = 1+7+3 = 11, right sum = 5+6 = 11" },
          { input: "nums = [1,2,3]",        output: "-1", explanation: "No pivot index exists" },
        ],
        approach:
          "Compute total sum first. Scan left to right maintaining leftSum. At each index: rightSum = total - leftSum - nums[i]. If leftSum == rightSum, found the pivot. No extra array needed.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func pivotIndex(nums []int) int {
	total := 0
	for _, v := range nums {
		total += v
	}
	leftSum := 0
	for i, v := range nums {
		rightSum := total - leftSum - v
		if leftSum == rightSum {
			return i
		}
		leftSum += v
	}
	return -1
}

func main() {
	fmt.Println(pivotIndex([]int{1, 7, 3, 6, 5, 6}))
	// Output: 3

	fmt.Println(pivotIndex([]int{1, 2, 3}))
	// Output: -1

	fmt.Println(pivotIndex([]int{2, 1, -1}))
	// Output: 0
}`,
      },
      {
        id: "subarray-sum-equals-k",
        title: "Subarray Sum Equals K",
        difficulty: "Medium",
        leetcode: 560,
        description:
          "Given an array of integers nums and integer k, return the total number of subarrays whose sum equals k.",
        examples: [
          { input: "nums = [1,1,1], k = 2",    output: "2", explanation: "Subarrays [0,1] and [1,2] both sum to 2" },
          { input: "nums = [1,2,3], k = 3",    output: "2", explanation: "[1,2] and [3] both sum to 3" },
        ],
        approach:
          "Use a prefix sum + hash map. For each index, if (currentSum - k) exists in the map, those earlier prefix sums form valid subarrays ending here. Map stores count of each prefix sum seen. Initialize map with {0: 1} to handle subarrays starting at index 0.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func subarraySum(nums []int, k int) int {
	count := make(map[int]int)
	count[0] = 1 // empty prefix
	sum, result := 0, 0
	for _, v := range nums {
		sum += v
		result += count[sum-k]
		count[sum]++
	}
	return result
}

func main() {
	fmt.Println(subarraySum([]int{1, 1, 1}, 2))
	// Output: 2

	fmt.Println(subarraySum([]int{1, 2, 3}, 3))
	// Output: 2

	fmt.Println(subarraySum([]int{-1, -1, 1}, 0))
	// Output: 1
}`,
      },
      {
        id: "contiguous-array",
        title: "Contiguous Array",
        difficulty: "Medium",
        leetcode: 525,
        description:
          "Given a binary array nums, return the maximum length of a contiguous subarray with an equal number of 0s and 1s.",
        examples: [
          { input: "nums = [0,1]",         output: "2", explanation: "The whole array has one 0 and one 1" },
          { input: "nums = [0,1,0]",       output: "2", explanation: "[0,1] or [1,0] both have length 2" },
        ],
        approach:
          "Replace every 0 with -1. Now the problem becomes: longest subarray with sum 0 — a classic prefix sum problem. Store the first index where each prefix sum was seen. If we see the same prefix sum again, the subarray between is balanced.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func findMaxLength(nums []int) int {
	// Map prefix sum → first index it appeared
	seen := map[int]int{0: -1}
	sum, best := 0, 0
	for i, v := range nums {
		if v == 0 {
			sum--
		} else {
			sum++
		}
		if idx, ok := seen[sum]; ok {
			if i-idx > best {
				best = i - idx
			}
		} else {
			seen[sum] = i
		}
	}
	return best
}

func main() {
	fmt.Println(findMaxLength([]int{0, 1}))
	// Output: 2

	fmt.Println(findMaxLength([]int{0, 1, 0}))
	// Output: 2

	fmt.Println(findMaxLength([]int{0, 0, 1, 0, 0, 0, 1, 1}))
	// Output: 6
}`,
      },
      {
        id: "subarray-sums-divisible-by-k",
        title: "Subarray Sums Divisible by K",
        difficulty: "Medium",
        leetcode: 974,
        description:
          "Given an integer array nums and integer k, return the number of non-empty subarrays whose sum is divisible by k.",
        examples: [
          { input: "nums = [4,5,0,-2,-3,1], k = 5", output: "7", explanation: "7 subarrays have sums divisible by 5" },
          { input: "nums = [5], k = 9",              output: "0", explanation: "5 is not divisible by 9" },
        ],
        approach:
          "If two prefix sums share the same remainder mod k, the subarray between them is divisible by k. Count how many times each remainder has been seen. Use (remainder + k) % k to handle negative remainders correctly.",
        complexity: { time: "O(n)", space: "O(k)" },
        code: `package main

import "fmt"

func subarraysDivByK(nums []int, k int) int {
	count := make(map[int]int)
	count[0] = 1
	sum, result := 0, 0
	for _, v := range nums {
		sum += v
		rem := ((sum % k) + k) % k // handle negatives
		result += count[rem]
		count[rem]++
	}
	return result
}

func main() {
	fmt.Println(subarraysDivByK([]int{4, 5, 0, -2, -3, 1}, 5))
	// Output: 7

	fmt.Println(subarraysDivByK([]int{5}, 9))
	// Output: 0
}`,
      },
      {
        id: "max-size-subarray-sum-k",
        title: "Maximum Size Subarray Sum Equals k",
        difficulty: "Medium",
        leetcode: 325,
        description:
          "Given an integer array nums and an integer k, return the maximum length of a subarray that sums to k.",
        examples: [
          { input: "nums = [1,-1,5,-2,3], k = 3", output: "4", explanation: "Subarray [1,-1,5,-2] sums to 3 with length 4" },
          { input: "nums = [-2,-1,2,1], k = 1",   output: "2", explanation: "Subarray [-1,2] sums to 1 with length 2" },
        ],
        approach:
          "Store the first occurrence index of each prefix sum in a hash map. For each index i, if (prefixSum - k) is in the map, the subarray from map[prefixSum-k]+1 to i sums to k. Track the maximum such length.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func maxSubArrayLen(nums []int, k int) int {
	seen := map[int]int{0: -1}
	sum, best := 0, 0
	for i, v := range nums {
		sum += v
		if idx, ok := seen[sum-k]; ok {
			if i-idx > best {
				best = i - idx
			}
		}
		// only store first occurrence — longer subarray wins
		if _, ok := seen[sum]; !ok {
			seen[sum] = i
		}
	}
	return best
}

func main() {
	fmt.Println(maxSubArrayLen([]int{1, -1, 5, -2, 3}, 3))
	// Output: 4

	fmt.Println(maxSubArrayLen([]int{-2, -1, 2, 1}, 1))
	// Output: 2
}`,
      },
      {
        id: "minimum-value-positive-prefix",
        title: "Minimum Value to Get Positive Step by Step Sum",
        difficulty: "Easy",
        leetcode: 1413,
        description:
          "Given an array nums, choose a positive integer startValue such that the step-by-step sum of startValue + nums[0] + nums[1] + ... is always at least 1. Return the minimum such startValue.",
        examples: [
          { input: "nums = [-3,2,-3,4,2]", output: "5", explanation: "startValue=5 → 2,4,1,5,7 all ≥ 1" },
          { input: "nums = [1,2]",          output: "1", explanation: "prefix sums are positive on their own" },
        ],
        approach:
          "Compute prefix sums as you go, tracking the minimum prefix sum seen. The answer is max(1, 1 - minPrefix). If the prefix sum never goes below 1, startValue = 1 is enough; otherwise you need to compensate for the deepest dip.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func minStartValue(nums []int) int {
	sum, minSum := 0, 0
	for _, v := range nums {
		sum += v
		if sum < minSum {
			minSum = sum
		}
	}
	start := 1 - minSum
	if start < 1 {
		start = 1
	}
	return start
}

func main() {
	fmt.Println(minStartValue([]int{-3, 2, -3, 4, 2}))
	// Output: 5

	fmt.Println(minStartValue([]int{1, 2}))
	// Output: 1

	fmt.Println(minStartValue([]int{1, -2, -3}))
	// Output: 5
}`,
      },
      {
        id: "number-of-ways-split-array",
        title: "Number of Ways to Split Array",
        difficulty: "Medium",
        leetcode: 2270,
        description:
          "Given a 0-indexed integer array nums of length n, return the number of indices i (0 ≤ i < n-1) where the sum of the first i+1 elements is greater than or equal to the sum of the remaining elements.",
        examples: [
          { input: "nums = [10,4,-8,7]", output: "2", explanation: "Splits at i=0 (10 ≥ 3) and i=2 (6 ≥ 7? No) — splits at i=0 and i=1" },
          { input: "nums = [2,3,1,0]",   output: "2", explanation: "Valid splits at indices 1 and 2" },
        ],
        approach:
          "Compute total sum. Scan from left, maintaining leftSum. At each valid split point i (0 to n-2), rightSum = total - leftSum. If leftSum >= rightSum, count it. Update leftSum each step.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func waysToSplitArray(nums []int) int {
	total := 0
	for _, v := range nums {
		total += v
	}
	leftSum, count := 0, 0
	for i := 0; i < len(nums)-1; i++ {
		leftSum += nums[i]
		if leftSum >= total-leftSum {
			count++
		}
	}
	return count
}

func main() {
	fmt.Println(waysToSplitArray([]int{10, 4, -8, 7}))
	// Output: 2

	fmt.Println(waysToSplitArray([]int{2, 3, 1, 0}))
	// Output: 2
}`,
      },
      {
        id: "count-nice-subarrays",
        title: "Count Number of Nice Subarrays",
        difficulty: "Medium",
        leetcode: 1248,
        description:
          "Given an array of integers nums and integer k, return the number of contiguous subarrays that contain exactly k odd numbers.",
        examples: [
          { input: "nums = [1,1,2,1,1], k = 3", output: "2", explanation: "Subarrays [1,1,2,1] and [1,2,1,1] each have 3 odd numbers" },
          { input: "nums = [2,4,6], k = 1",     output: "0", explanation: "No odd numbers in the array" },
        ],
        approach:
          "Map each element to 1 (odd) or 0 (even), then the problem becomes: count subarrays with sum exactly k — identical to Subarray Sum Equals K. Use prefix sum + hash map. count[0]=1 handles subarrays from the start.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func numberOfSubarrays(nums []int, k int) int {
	count := map[int]int{0: 1}
	sum, result := 0, 0
	for _, v := range nums {
		if v%2 != 0 {
			sum++ // treat odd as 1, even as 0
		}
		result += count[sum-k]
		count[sum]++
	}
	return result
}

func main() {
	fmt.Println(numberOfSubarrays([]int{1, 1, 2, 1, 1}, 3))
	// Output: 2

	fmt.Println(numberOfSubarrays([]int{2, 4, 6}, 1))
	// Output: 0

	fmt.Println(numberOfSubarrays([]int{2, 2, 2, 1, 2, 2, 1, 2, 2, 2}, 2))
	// Output: 16
}`,
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // 4. Hashing
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "hashing",
    icon: "#️⃣",
    title: "Hashing",
    problems: [
      {
        id: "contains-duplicate",
        title: "Contains Duplicate",
        difficulty: "Easy",
        leetcode: 217,
        description:
          "Given an integer array nums, return true if any value appears at least twice, false if every element is distinct.",
        examples: [
          { input: "nums = [1,2,3,1]",    output: "true",  explanation: "1 appears at index 0 and index 3" },
          { input: "nums = [1,2,3,4]",    output: "false", explanation: "All elements are distinct" },
        ],
        approach:
          "Insert each element into a hash set as you iterate. Before inserting, check if it already exists — if yes, a duplicate is found. Early exit on first hit; otherwise false after the full scan.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func containsDuplicate(nums []int) bool {
	seen := make(map[int]bool)
	for _, v := range nums {
		if seen[v] {
			return true
		}
		seen[v] = true
	}
	return false
}

func main() {
	fmt.Println(containsDuplicate([]int{1, 2, 3, 1}))
	// Output: true

	fmt.Println(containsDuplicate([]int{1, 2, 3, 4}))
	// Output: false

	fmt.Println(containsDuplicate([]int{1, 1, 1, 3, 3, 4, 3, 2, 4, 2}))
	// Output: true
}`,
      },
      {
        id: "valid-anagram",
        title: "Valid Anagram",
        difficulty: "Easy",
        leetcode: 242,
        description:
          "Given two strings s and t, return true if t is an anagram of s — both strings use the same characters the same number of times.",
        examples: [
          { input: 's = "anagram", t = "nagaram"', output: "true",  explanation: "Same characters, same counts" },
          { input: 's = "rat", t = "car"',         output: "false", explanation: "Different characters" },
        ],
        approach:
          "Use a 26-element frequency array. Increment for each character in s, decrement for each in t. If any count is non-zero at the end, the strings are not anagrams. Fails fast on length mismatch.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func isAnagram(s string, t string) bool {
	if len(s) != len(t) {
		return false
	}
	freq := [26]int{}
	for i := 0; i < len(s); i++ {
		freq[s[i]-'a']++
		freq[t[i]-'a']--
	}
	for _, v := range freq {
		if v != 0 {
			return false
		}
	}
	return true
}

func main() {
	fmt.Println(isAnagram("anagram", "nagaram"))
	// Output: true

	fmt.Println(isAnagram("rat", "car"))
	// Output: false

	fmt.Println(isAnagram("listen", "silent"))
	// Output: true
}`,
      },
      {
        id: "group-anagrams",
        title: "Group Anagrams",
        difficulty: "Medium",
        leetcode: 49,
        description:
          "Given an array of strings strs, group the anagrams together. You can return the answer in any order.",
        examples: [
          { input: 'strs = ["eat","tea","tan","ate","nat","bat"]', output: '[["eat","tea","ate"],["tan","nat"],["bat"]]', explanation: "Three anagram groups" },
          { input: 'strs = [""]',                                  output: '[[""]]',                                        explanation: "Single empty string group" },
        ],
        approach:
          "For each word, build a key by sorting its characters (or using a 26-char frequency string). Words with the same key are anagrams — collect them in a map keyed by that signature.",
        complexity: { time: "O(n·k·log k) where k = max word length", space: "O(n·k)" },
        code: `package main

import (
	"fmt"
	"sort"
)

func groupAnagrams(strs []string) [][]string {
	groups := make(map[string][]string)
	for _, s := range strs {
		b := []byte(s)
		sort.Slice(b, func(i, j int) bool { return b[i] < b[j] })
		key := string(b)
		groups[key] = append(groups[key], s)
	}
	result := make([][]string, 0, len(groups))
	for _, v := range groups {
		result = append(result, v)
	}
	return result
}

func main() {
	strs := []string{"eat", "tea", "tan", "ate", "nat", "bat"}
	groups := groupAnagrams(strs)
	for _, g := range groups {
		fmt.Println(g)
	}
	// Output (order may vary):
	// [eat tea ate]
	// [tan nat]
	// [bat]
}`,
      },
      {
        id: "top-k-frequent-elements",
        title: "Top K Frequent Elements",
        difficulty: "Medium",
        leetcode: 347,
        description:
          "Given an integer array nums and integer k, return the k most frequent elements. The answer is guaranteed to be unique and can be in any order.",
        examples: [
          { input: "nums = [1,1,1,2,2,3], k = 2", output: "[1 2]", explanation: "1 appears 3×, 2 appears 2×" },
          { input: "nums = [1], k = 1",            output: "[1]",   explanation: "Only one element" },
        ],
        approach:
          "Count frequencies with a map. Use bucket sort: create an array of length n+1 where index i holds all numbers appearing i times. Scan buckets from high to low, collecting elements until you have k.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func topKFrequent(nums []int, k int) []int {
	freq := make(map[int]int)
	for _, v := range nums {
		freq[v]++
	}

	// bucket[i] = list of numbers with frequency i
	bucket := make([][]int, len(nums)+1)
	for num, cnt := range freq {
		bucket[cnt] = append(bucket[cnt], num)
	}

	result := []int{}
	for i := len(bucket) - 1; i >= 0 && len(result) < k; i-- {
		result = append(result, bucket[i]...)
	}
	return result[:k]
}

func main() {
	fmt.Println(topKFrequent([]int{1, 1, 1, 2, 2, 3}, 2))
	// Output: [1 2]

	fmt.Println(topKFrequent([]int{1}, 1))
	// Output: [1]

	fmt.Println(topKFrequent([]int{4, 1, -1, 2, -1, 2, 3}, 2))
	// Output: [-1 2]
}`,
      },
      {
        id: "longest-consecutive-sequence",
        title: "Longest Consecutive Sequence",
        difficulty: "Medium",
        leetcode: 128,
        description:
          "Given an unsorted integer array nums, return the length of the longest consecutive elements sequence. Must run in O(n).",
        examples: [
          { input: "nums = [100,4,200,1,3,2]", output: "4", explanation: "Sequence [1,2,3,4] has length 4" },
          { input: "nums = [0,3,7,2,5,8,4,6,0,1]", output: "9", explanation: "Sequence [0,1,2,3,4,5,6,7,8]" },
        ],
        approach:
          "Put all numbers in a hash set. For each number, only start counting if (num-1) is NOT in the set — meaning it's the start of a sequence. Then count up (num+1, num+2, …) while those values exist. This ensures each element is visited at most twice.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func longestConsecutive(nums []int) int {
	set := make(map[int]bool)
	for _, v := range nums {
		set[v] = true
	}
	best := 0
	for v := range set {
		if set[v-1] {
			continue // not the start of a sequence
		}
		length := 1
		for set[v+length] {
			length++
		}
		if length > best {
			best = length
		}
	}
	return best
}

func main() {
	fmt.Println(longestConsecutive([]int{100, 4, 200, 1, 3, 2}))
	// Output: 4

	fmt.Println(longestConsecutive([]int{0, 3, 7, 2, 5, 8, 4, 6, 0, 1}))
	// Output: 9
}`,
      },
      {
        id: "isomorphic-strings",
        title: "Isomorphic Strings",
        difficulty: "Easy",
        leetcode: 205,
        description:
          "Given two strings s and t, return true if they are isomorphic — characters in s can be replaced to get t, with no two characters mapping to the same character.",
        examples: [
          { input: 's = "egg", t = "add"',   output: "true",  explanation: "e→a, g→d" },
          { input: 's = "foo", t = "bar"',   output: "false", explanation: "o would need to map to both a and r" },
        ],
        approach:
          "Maintain two maps: s→t and t→s. For each character pair (sc, tc): if sc is already mapped, it must map to tc; if tc is already reverse-mapped, it must come from sc. Any conflict returns false.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func isIsomorphic(s string, t string) bool {
	sToT := make(map[byte]byte)
	tToS := make(map[byte]byte)
	for i := 0; i < len(s); i++ {
		sc, tc := s[i], t[i]
		if mapped, ok := sToT[sc]; ok && mapped != tc {
			return false
		}
		if mapped, ok := tToS[tc]; ok && mapped != sc {
			return false
		}
		sToT[sc] = tc
		tToS[tc] = sc
	}
	return true
}

func main() {
	fmt.Println(isIsomorphic("egg", "add"))
	// Output: true

	fmt.Println(isIsomorphic("foo", "bar"))
	// Output: false

	fmt.Println(isIsomorphic("paper", "title"))
	// Output: true
}`,
      },
      {
        id: "word-pattern",
        title: "Word Pattern",
        difficulty: "Easy",
        leetcode: 290,
        description:
          "Given a pattern and a string s (space-separated words), return true if s follows the same bijective mapping as pattern — each letter maps to exactly one word and vice versa.",
        examples: [
          { input: 'pattern = "abba", s = "dog cat cat dog"', output: "true",  explanation: "a→dog, b→cat" },
          { input: 'pattern = "abba", s = "dog cat cat fish"',output: "false", explanation: "a would need to map to both dog and fish" },
        ],
        approach:
          "Split s into words. Check lengths match. Build two maps: pattern-char→word and word→pattern-char. For each pair, any inconsistency returns false — same bijection check as Isomorphic Strings.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import (
	"fmt"
	"strings"
)

func wordPattern(pattern string, s string) bool {
	words := strings.Split(s, " ")
	if len(pattern) != len(words) {
		return false
	}
	charToWord := make(map[byte]string)
	wordToChar := make(map[string]byte)
	for i := 0; i < len(pattern); i++ {
		c, w := pattern[i], words[i]
		if mapped, ok := charToWord[c]; ok && mapped != w {
			return false
		}
		if mapped, ok := wordToChar[w]; ok && mapped != c {
			return false
		}
		charToWord[c] = w
		wordToChar[w] = c
	}
	return true
}

func main() {
	fmt.Println(wordPattern("abba", "dog cat cat dog"))
	// Output: true

	fmt.Println(wordPattern("abba", "dog cat cat fish"))
	// Output: false

	fmt.Println(wordPattern("aaaa", "dog cat cat dog"))
	// Output: false
}`,
      },
      {
        id: "happy-number",
        title: "Happy Number",
        difficulty: "Easy",
        leetcode: 202,
        description:
          "A happy number eventually reaches 1 when repeatedly replaced by the sum of squares of its digits. Return true if n is happy, false if it loops forever.",
        examples: [
          { input: "n = 19", output: "true",  explanation: "1²+9²=82 → 8²+2²=68 → 6²+8²=100 → 1²+0²+0²=1" },
          { input: "n = 2",  output: "false", explanation: "Enters a cycle that never reaches 1" },
        ],
        approach:
          "Use Floyd's cycle detection on the sequence. Slow pointer takes one step (one digit-square-sum), fast pointer takes two. If fast reaches 1, happy. If slow meets fast (not at 1), a cycle was detected — not happy.",
        complexity: { time: "O(log n)", space: "O(1)" },
        code: `package main

import "fmt"

func sumOfSquares(n int) int {
	sum := 0
	for n > 0 {
		d := n % 10
		sum += d * d
		n /= 10
	}
	return sum
}

func isHappy(n int) bool {
	slow, fast := n, sumOfSquares(n)
	for fast != 1 && slow != fast {
		slow = sumOfSquares(slow)
		fast = sumOfSquares(sumOfSquares(fast))
	}
	return fast == 1
}

func main() {
	fmt.Println(isHappy(19))
	// Output: true

	fmt.Println(isHappy(2))
	// Output: false

	fmt.Println(isHappy(1))
	// Output: true
}`,
      },
      {
        id: "four-sum-ii",
        title: "4Sum II",
        difficulty: "Medium",
        leetcode: 454,
        description:
          "Given four integer arrays A, B, C, D each of length n, return the number of tuples (i,j,k,l) such that A[i] + B[j] + C[k] + D[l] == 0.",
        examples: [
          { input: "A=[1,2], B=[-2,-1], C=[-1,2], D=[0,2]", output: "2", explanation: "(0,0,0,0): 1+(-2)+(-1)+2=0 and (1,1,0,0): 2+(-1)+(-1)+0=0" },
          { input: "A=[0], B=[0], C=[0], D=[0]",            output: "1", explanation: "Only one tuple: (0,0,0,0)" },
        ],
        approach:
          "Split into two halves. Store all A[i]+B[j] sums in a map with their counts. For every C[k]+D[l], look up -(C[k]+D[l]) in the map. The count of matching pairs is added to the result.",
        complexity: { time: "O(n²)", space: "O(n²)" },
        code: `package main

import "fmt"

func fourSumCount(nums1, nums2, nums3, nums4 []int) int {
	sumAB := make(map[int]int)
	for _, a := range nums1 {
		for _, b := range nums2 {
			sumAB[a+b]++
		}
	}
	count := 0
	for _, c := range nums3 {
		for _, d := range nums4 {
			count += sumAB[-(c + d)]
		}
	}
	return count
}

func main() {
	a := []int{1, 2}
	b := []int{-2, -1}
	c := []int{-1, 2}
	d := []int{0, 2}
	fmt.Println(fourSumCount(a, b, c, d))
	// Output: 2

	fmt.Println(fourSumCount([]int{0}, []int{0}, []int{0}, []int{0}))
	// Output: 1
}`,
      },
      {
        id: "ransom-note",
        title: "Ransom Note",
        difficulty: "Easy",
        leetcode: 383,
        description:
          "Given two strings ransomNote and magazine, return true if ransomNote can be constructed using letters from magazine. Each letter in magazine can only be used once.",
        examples: [
          { input: 'ransomNote = "aa", magazine = "aab"', output: "true",  explanation: "magazine has two a's, ransomNote needs two" },
          { input: 'ransomNote = "aa", magazine = "ab"',  output: "false", explanation: "magazine only has one a" },
        ],
        approach:
          "Count the frequency of each letter in magazine using a 26-element array. Then for each letter in ransomNote, decrement its count — if any count drops below 0, the letter isn't available and return false.",
        complexity: { time: "O(m+n)", space: "O(1)" },
        code: `package main

import "fmt"

func canConstruct(ransomNote string, magazine string) bool {
	freq := [26]int{}
	for _, c := range magazine {
		freq[c-'a']++
	}
	for _, c := range ransomNote {
		freq[c-'a']--
		if freq[c-'a'] < 0 {
			return false
		}
	}
	return true
}

func main() {
	fmt.Println(canConstruct("aa", "aab"))
	// Output: true

	fmt.Println(canConstruct("aa", "ab"))
	// Output: false

	fmt.Println(canConstruct("bg", "efjbdfbdgfjhhaiigfhbaejahgfbbgbjagbddfgdiaigdadhcfcj"))
	// Output: true
}`,
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // 5. Stack
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "stack",
    icon: "📚",
    title: "Stack",
    problems: [
      {
        id: "valid-parentheses",
        title: "Valid Parentheses",
        difficulty: "Easy",
        leetcode: 20,
        description:
          "Given a string s containing only '(', ')', '{', '}', '[', ']', determine if the input string is valid. Brackets must close in the correct order.",
        examples: [
          { input: 's = "()"',      output: "true",  explanation: "Single matching pair" },
          { input: 's = "([)]"',    output: "false", explanation: "Brackets close in wrong order" },
          { input: 's = "{[]}"',    output: "true",  explanation: "Properly nested" },
        ],
        approach:
          "Push opening brackets onto a stack. When a closing bracket is seen, check if the top of the stack is its matching opener — if not, invalid. After the full scan the stack must be empty.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func isValid(s string) bool {
	stack := []byte{}
	pair := map[byte]byte{')': '(', '}': '{', ']': '['}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '(' || c == '{' || c == '[' {
			stack = append(stack, c)
		} else {
			if len(stack) == 0 || stack[len(stack)-1] != pair[c] {
				return false
			}
			stack = stack[:len(stack)-1]
		}
	}
	return len(stack) == 0
}

func main() {
	fmt.Println(isValid("()"))
	// Output: true

	fmt.Println(isValid("()[]{}" ))
	// Output: true

	fmt.Println(isValid("([)]"))
	// Output: false

	fmt.Println(isValid("{[]}"))
	// Output: true
}`,
      },
      {
        id: "min-stack",
        title: "Min Stack",
        difficulty: "Medium",
        leetcode: 155,
        description:
          "Design a stack that supports push, pop, top, and getMin — all in O(1) time.",
        examples: [
          { input: 'push(-2), push(0), push(-3), getMin(), pop(), top(), getMin()', output: "-3, 0, -2", explanation: "getMin always returns the current minimum" },
        ],
        approach:
          "Maintain two stacks: the main stack and a minStack. On push, append to minStack the minimum of the new value and the current min. On pop, pop both stacks together. getMin always reads the top of minStack.",
        complexity: { time: "O(1) all ops", space: "O(n)" },
        code: `package main

import "fmt"

type MinStack struct {
	stack    []int
	minStack []int
}

func Constructor() MinStack {
	return MinStack{}
}

func (ms *MinStack) Push(val int) {
	ms.stack = append(ms.stack, val)
	minVal := val
	if len(ms.minStack) > 0 {
		top := ms.minStack[len(ms.minStack)-1]
		if top < minVal {
			minVal = top
		}
	}
	ms.minStack = append(ms.minStack, minVal)
}

func (ms *MinStack) Pop() {
	ms.stack = ms.stack[:len(ms.stack)-1]
	ms.minStack = ms.minStack[:len(ms.minStack)-1]
}

func (ms *MinStack) Top() int {
	return ms.stack[len(ms.stack)-1]
}

func (ms *MinStack) GetMin() int {
	return ms.minStack[len(ms.minStack)-1]
}

func main() {
	ms := Constructor()
	ms.Push(-2)
	ms.Push(0)
	ms.Push(-3)
	fmt.Println(ms.GetMin()) // Output: -3
	ms.Pop()
	fmt.Println(ms.Top())    // Output: 0
	fmt.Println(ms.GetMin()) // Output: -2
}`,
      },
      {
        id: "evaluate-reverse-polish-notation",
        title: "Evaluate Reverse Polish Notation",
        difficulty: "Medium",
        leetcode: 150,
        description:
          "Evaluate an arithmetic expression in Reverse Polish Notation. Valid operators are +, -, *, /. Division truncates toward zero.",
        examples: [
          { input: 'tokens = ["2","1","+","3","*"]',        output: "9",  explanation: "((2+1)*3) = 9" },
          { input: 'tokens = ["4","13","5","/","+"]',       output: "6",  explanation: "(4+(13/5)) = 6" },
        ],
        approach:
          "Push numbers onto a stack. When an operator is encountered, pop two operands (right then left), apply the operation, and push the result. The final stack top is the answer.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import (
	"fmt"
	"strconv"
)

func evalRPN(tokens []string) int {
	stack := []int{}
	for _, t := range tokens {
		switch t {
		case "+", "-", "*", "/":
			b, a := stack[len(stack)-1], stack[len(stack)-2]
			stack = stack[:len(stack)-2]
			switch t {
			case "+": stack = append(stack, a+b)
			case "-": stack = append(stack, a-b)
			case "*": stack = append(stack, a*b)
			case "/": stack = append(stack, a/b)
			}
		default:
			num, _ := strconv.Atoi(t)
			stack = append(stack, num)
		}
	}
	return stack[0]
}

func main() {
	fmt.Println(evalRPN([]string{"2", "1", "+", "3", "*"}))
	// Output: 9

	fmt.Println(evalRPN([]string{"4", "13", "5", "/", "+"}))
	// Output: 6

	fmt.Println(evalRPN([]string{"10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"}))
	// Output: 22
}`,
      },
      {
        id: "daily-temperatures",
        title: "Daily Temperatures",
        difficulty: "Medium",
        leetcode: 739,
        description:
          "Given an array of daily temperatures, return an array where answer[i] is the number of days you have to wait after day i to get a warmer temperature. If no warmer day exists, answer[i] = 0.",
        examples: [
          { input: "temperatures = [73,74,75,71,69,72,76,73]", output: "[1 1 4 2 1 1 0 0]", explanation: "Day 0→1 day wait, day 2→4 days wait, etc." },
          { input: "temperatures = [30,40,50,60]",             output: "[1 1 1 0]",          explanation: "Each day is warmer than the previous" },
        ],
        approach:
          "Monotonic decreasing stack storing indices. For each temperature, pop all indices from the stack whose temperature is less than the current — their wait time is (current index − popped index). Push the current index.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func dailyTemperatures(temperatures []int) []int {
	n := len(temperatures)
	answer := make([]int, n)
	stack := []int{} // indices of unresolved days

	for i, t := range temperatures {
		for len(stack) > 0 && temperatures[stack[len(stack)-1]] < t {
			idx := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			answer[idx] = i - idx
		}
		stack = append(stack, i)
	}
	return answer
}

func main() {
	fmt.Println(dailyTemperatures([]int{73, 74, 75, 71, 69, 72, 76, 73}))
	// Output: [1 1 4 2 1 1 0 0]

	fmt.Println(dailyTemperatures([]int{30, 40, 50, 60}))
	// Output: [1 1 1 0]

	fmt.Println(dailyTemperatures([]int{30, 60, 90}))
	// Output: [1 1 0]
}`,
      },
      {
        id: "largest-rectangle-in-histogram",
        title: "Largest Rectangle in Histogram",
        difficulty: "Hard",
        leetcode: 84,
        description:
          "Given an array of integers heights representing bar heights in a histogram, return the area of the largest rectangle that can be formed.",
        examples: [
          { input: "heights = [2,1,5,6,2,3]", output: "10", explanation: "Rectangle of height 5 and width 2 (bars 2 and 3)" },
          { input: "heights = [2,4]",          output: "4",  explanation: "Single bar of height 4" },
        ],
        approach:
          "Monotonic increasing stack of indices. When a bar is shorter than the stack top, pop and compute area using the popped bar as height and (current index − new top − 1) as width. Append a sentinel 0 at the end to flush the stack.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func largestRectangleArea(heights []int) int {
	heights = append(heights, 0) // sentinel to flush stack
	stack := []int{}
	best := 0

	for i, h := range heights {
		for len(stack) > 0 && heights[stack[len(stack)-1]] > h {
			top := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			width := i
			if len(stack) > 0 {
				width = i - stack[len(stack)-1] - 1
			}
			area := heights[top] * width
			if area > best {
				best = area
			}
		}
		stack = append(stack, i)
	}
	return best
}

func main() {
	fmt.Println(largestRectangleArea([]int{2, 1, 5, 6, 2, 3}))
	// Output: 10

	fmt.Println(largestRectangleArea([]int{2, 4}))
	// Output: 4

	fmt.Println(largestRectangleArea([]int{1, 1}))
	// Output: 2
}`,
      },
      {
        id: "car-fleet",
        title: "Car Fleet",
        difficulty: "Medium",
        leetcode: 853,
        description:
          "N cars travel to the same destination at mile target. Each car i starts at position[i] with speed[i]. Cars cannot pass each other — if a faster car catches a slower one they form a fleet. Return the number of fleets that arrive.",
        examples: [
          { input: "target=12, position=[10,8,0,5,3], speed=[2,4,1,1,3]", output: "3", explanation: "Cars form 3 fleets" },
          { input: "target=10, position=[3], speed=[3]",                   output: "1", explanation: "Only one car" },
        ],
        approach:
          "Sort cars by position descending (closest to target first). Compute each car's time to reach target. Use a stack: if the current car's time ≤ stack top's time it joins that fleet (pop). Otherwise it's a new fleet (push). Stack size = fleet count.",
        complexity: { time: "O(n log n)", space: "O(n)" },
        code: `package main

import (
	"fmt"
	"sort"
)

func carFleet(target int, position []int, speed []int) int {
	n := len(position)
	cars := make([][2]float64, n)
	for i := range position {
		cars[i] = [2]float64{float64(position[i]), float64(speed[i])}
	}
	// sort by position descending (closest to target first)
	sort.Slice(cars, func(i, j int) bool {
		return cars[i][0] > cars[j][0]
	})

	stack := []float64{}
	for _, c := range cars {
		time := (float64(target) - c[0]) / c[1]
		// if this car arrives before or with the fleet ahead, it joins
		if len(stack) == 0 || time > stack[len(stack)-1] {
			stack = append(stack, time)
		}
	}
	return len(stack)
}

func main() {
	fmt.Println(carFleet(12, []int{10, 8, 0, 5, 3}, []int{2, 4, 1, 1, 3}))
	// Output: 3

	fmt.Println(carFleet(10, []int{3}, []int{3}))
	// Output: 1

	fmt.Println(carFleet(100, []int{0, 2, 4}, []int{4, 2, 1}))
	// Output: 1
}`,
      },
      {
        id: "asteroid-collision",
        title: "Asteroid Collision",
        difficulty: "Medium",
        leetcode: 735,
        description:
          "Given an array of asteroids moving in a row (positive = right, negative = left), find the state after all collisions. When two asteroids meet the smaller one explodes; equal sizes both explode.",
        examples: [
          { input: "asteroids = [5,10,-5]",    output: "[5 10]",    explanation: "10 and -5 collide; 10 survives" },
          { input: "asteroids = [8,-8]",        output: "[]",        explanation: "Equal sizes, both explode" },
          { input: "asteroids = [10,2,-5]",     output: "[10]",      explanation: "2 and -5 collide, -5 wins; then 10 and -5 collide, 10 wins" },
        ],
        approach:
          "Stack stores surviving asteroids. For each asteroid: if it moves right, push. If it moves left, compare with the stack top — pop smaller rightward ones. If equal, pop both. If top is bigger, the new asteroid is destroyed. Push only if it survives.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func asteroidCollision(asteroids []int) []int {
	stack := []int{}
	for _, a := range asteroids {
		alive := true
		for alive && a < 0 && len(stack) > 0 && stack[len(stack)-1] > 0 {
			top := stack[len(stack)-1]
			if top < -a {
				stack = stack[:len(stack)-1] // top destroyed
			} else if top == -a {
				stack = stack[:len(stack)-1] // both destroyed
				alive = false
			} else {
				alive = false // current destroyed
			}
		}
		if alive {
			stack = append(stack, a)
		}
	}
	return stack
}

func main() {
	fmt.Println(asteroidCollision([]int{5, 10, -5}))
	// Output: [5 10]

	fmt.Println(asteroidCollision([]int{8, -8}))
	// Output: []

	fmt.Println(asteroidCollision([]int{10, 2, -5}))
	// Output: [10]

	fmt.Println(asteroidCollision([]int{-2, -1, 1, 2}))
	// Output: [-2 -1 1 2]
}`,
      },
      {
        id: "decode-string",
        title: "Decode String",
        difficulty: "Medium",
        leetcode: 394,
        description:
          "Given an encoded string like 3[a2[c]], return its decoded form. The encoding rule is k[encoded_string] — repeat encoded_string exactly k times.",
        examples: [
          { input: 's = "3[a]2[bc]"',   output: '"aaabcbc"',   explanation: "aaa + bcbc" },
          { input: 's = "3[a2[c]]"',    output: '"accaccacc"', explanation: "Inner 2[c]=cc, then 3[acc]=accaccacc" },
        ],
        approach:
          "Two stacks: one for repeat counts, one for the string built so far. On '[': push current count and current string, reset both. On ']': pop count and previous string, repeat current string count times and append. On digit: build the number. On letter: append to current string.",
        complexity: { time: "O(n·k) where k = max repeat", space: "O(n)" },
        code: `package main

import (
	"fmt"
	"strings"
)

func decodeString(s string) string {
	countStack := []int{}
	strStack := []string{}
	current := ""
	k := 0

	for _, c := range s {
		if c >= '0' && c <= '9' {
			k = k*10 + int(c-'0')
		} else if c == '[' {
			countStack = append(countStack, k)
			strStack = append(strStack, current)
			current = ""
			k = 0
		} else if c == ']' {
			count := countStack[len(countStack)-1]
			countStack = countStack[:len(countStack)-1]
			prev := strStack[len(strStack)-1]
			strStack = strStack[:len(strStack)-1]
			current = prev + strings.Repeat(current, count)
		} else {
			current += string(c)
		}
	}
	return current
}

func main() {
	fmt.Println(decodeString("3[a]2[bc]"))
	// Output: aaabcbc

	fmt.Println(decodeString("3[a2[c]]"))
	// Output: accaccacc

	fmt.Println(decodeString("2[abc]3[cd]ef"))
	// Output: abcabccdcdcdef
}`,
      },
      {
        id: "next-greater-element",
        title: "Next Greater Element I",
        difficulty: "Easy",
        leetcode: 496,
        description:
          "Given two arrays nums1 (subset of nums2), for each element in nums1 find its next greater element in nums2. The next greater element is the first element to the right that is larger. Return -1 if none exists.",
        examples: [
          { input: "nums1=[4,1,2], nums2=[1,3,4,2]", output: "[-1 3 -1]", explanation: "4 has no greater, 1's next greater is 3, 2 has none" },
          { input: "nums1=[2,4], nums2=[1,2,3,4]",    output: "[3 -1]",    explanation: "2's next greater is 3, 4 has no greater" },
        ],
        approach:
          "Monotonic decreasing stack over nums2. As you process each element, pop stack elements smaller than current — they found their next greater element (current). Store results in a map. Then look up each nums1 element in the map.",
        complexity: { time: "O(m+n)", space: "O(n)" },
        code: `package main

import "fmt"

func nextGreaterElement(nums1 []int, nums2 []int) []int {
	nextGreater := make(map[int]int)
	stack := []int{}

	for _, n := range nums2 {
		for len(stack) > 0 && stack[len(stack)-1] < n {
			top := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			nextGreater[top] = n
		}
		stack = append(stack, n)
	}
	// remaining in stack have no next greater
	for _, v := range stack {
		nextGreater[v] = -1
	}

	result := make([]int, len(nums1))
	for i, v := range nums1 {
		result[i] = nextGreater[v]
	}
	return result
}

func main() {
	fmt.Println(nextGreaterElement([]int{4, 1, 2}, []int{1, 3, 4, 2}))
	// Output: [-1 3 -1]

	fmt.Println(nextGreaterElement([]int{2, 4}, []int{1, 2, 3, 4}))
	// Output: [3 -1]
}`,
      },
      {
        id: "basic-calculator-ii",
        title: "Basic Calculator II",
        difficulty: "Medium",
        leetcode: 227,
        description:
          "Given a string s representing a mathematical expression with +, -, *, / and non-negative integers, evaluate and return the result. Division truncates toward zero. No parentheses.",
        examples: [
          { input: 's = "3+2*2"',     output: "7",  explanation: "Multiply first: 3 + 4 = 7" },
          { input: 's = " 3/2 "',     output: "1",  explanation: "Integer division: 1" },
          { input: 's = " 3+5 / 2 "', output: "5",  explanation: "3 + 2 = 5" },
        ],
        approach:
          "Scan left to right tracking the last operator. On + or -: push the signed number. On * or /: pop the stack top, apply the operation, push result. This defers addition/subtraction and resolves higher-precedence ops immediately. Sum the stack at the end.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func calculate(s string) int {
	stack := []int{}
	num := 0
	op := byte('+')

	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= '0' && c <= '9' {
			num = num*10 + int(c-'0')
		}
		if (c == '+' || c == '-' || c == '*' || c == '/') || i == len(s)-1 {
			switch op {
			case '+':
				stack = append(stack, num)
			case '-':
				stack = append(stack, -num)
			case '*':
				top := stack[len(stack)-1]
				stack[len(stack)-1] = top * num
			case '/':
				top := stack[len(stack)-1]
				stack[len(stack)-1] = top / num
			}
			op = c
			num = 0
		}
	}
	result := 0
	for _, v := range stack {
		result += v
	}
	return result
}

func main() {
	fmt.Println(calculate("3+2*2"))
	// Output: 7

	fmt.Println(calculate(" 3/2 "))
	// Output: 1

	fmt.Println(calculate(" 3+5 / 2 "))
	// Output: 5
}`,
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // 6. Binary Search
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "binary-search",
    icon: "🔍",
    title: "Binary Search",
    problems: [
      {
        id: "binary-search-classic",
        title: "Binary Search",
        difficulty: "Easy",
        leetcode: 704,
        description:
          "Given a sorted array of distinct integers and a target, return the index of target or -1 if not found. Must run in O(log n).",
        examples: [
          { input: "nums = [-1,0,3,5,9,12], target = 9", output: "4",  explanation: "9 exists at index 4" },
          { input: "nums = [-1,0,3,5,9,12], target = 2", output: "-1", explanation: "2 does not exist" },
        ],
        approach:
          "Classic binary search: maintain left and right pointers. Compute mid = left + (right-left)/2 to avoid overflow. If nums[mid] == target return mid. If target < nums[mid] search left half, else search right half.",
        complexity: { time: "O(log n)", space: "O(1)" },
        code: `package main

import "fmt"

func search(nums []int, target int) int {
	left, right := 0, len(nums)-1
	for left <= right {
		mid := left + (right-left)/2
		if nums[mid] == target {
			return mid
		} else if nums[mid] < target {
			left = mid + 1
		} else {
			right = mid - 1
		}
	}
	return -1
}

func main() {
	fmt.Println(search([]int{-1, 0, 3, 5, 9, 12}, 9))
	// Output: 4

	fmt.Println(search([]int{-1, 0, 3, 5, 9, 12}, 2))
	// Output: -1

	fmt.Println(search([]int{5}, 5))
	// Output: 0
}`,
      },
      {
        id: "search-rotated-sorted-array",
        title: "Search in Rotated Sorted Array",
        difficulty: "Medium",
        leetcode: 33,
        description:
          "An array sorted in ascending order was rotated at some pivot. Given the rotated array and a target, return the index of target or -1 if not found.",
        examples: [
          { input: "nums = [4,5,6,7,0,1,2], target = 0", output: "4",  explanation: "0 is at index 4" },
          { input: "nums = [4,5,6,7,0,1,2], target = 3", output: "-1", explanation: "3 is not in the array" },
        ],
        approach:
          "At every mid, one half is guaranteed sorted. Check which half is sorted: if nums[left] ≤ nums[mid] the left half is sorted — determine if target falls in it and narrow accordingly. Otherwise the right half is sorted — do the same.",
        complexity: { time: "O(log n)", space: "O(1)" },
        code: `package main

import "fmt"

func search(nums []int, target int) int {
	left, right := 0, len(nums)-1
	for left <= right {
		mid := left + (right-left)/2
		if nums[mid] == target {
			return mid
		}
		// left half is sorted
		if nums[left] <= nums[mid] {
			if target >= nums[left] && target < nums[mid] {
				right = mid - 1
			} else {
				left = mid + 1
			}
		} else {
			// right half is sorted
			if target > nums[mid] && target <= nums[right] {
				left = mid + 1
			} else {
				right = mid - 1
			}
		}
	}
	return -1
}

func main() {
	fmt.Println(search([]int{4, 5, 6, 7, 0, 1, 2}, 0))
	// Output: 4

	fmt.Println(search([]int{4, 5, 6, 7, 0, 1, 2}, 3))
	// Output: -1

	fmt.Println(search([]int{1}, 0))
	// Output: -1
}`,
      },
      {
        id: "find-minimum-rotated-sorted-array",
        title: "Find Minimum in Rotated Sorted Array",
        difficulty: "Medium",
        leetcode: 153,
        description:
          "Given a sorted array rotated at some pivot, find the minimum element. All values are unique.",
        examples: [
          { input: "nums = [3,4,5,1,2]", output: "1", explanation: "The minimum is 1" },
          { input: "nums = [4,5,6,7,0,1,2]", output: "0", explanation: "The minimum is 0" },
        ],
        approach:
          "The minimum is at the inflection point. If nums[mid] > nums[right], the minimum is in the right half — move left to mid+1. Otherwise the minimum is in the left half (including mid) — move right to mid. When left == right the answer is found.",
        complexity: { time: "O(log n)", space: "O(1)" },
        code: `package main

import "fmt"

func findMin(nums []int) int {
	left, right := 0, len(nums)-1
	for left < right {
		mid := left + (right-left)/2
		if nums[mid] > nums[right] {
			left = mid + 1
		} else {
			right = mid
		}
	}
	return nums[left]
}

func main() {
	fmt.Println(findMin([]int{3, 4, 5, 1, 2}))
	// Output: 1

	fmt.Println(findMin([]int{4, 5, 6, 7, 0, 1, 2}))
	// Output: 0

	fmt.Println(findMin([]int{11, 13, 15, 17}))
	// Output: 11
}`,
      },
      {
        id: "search-2d-matrix",
        title: "Search a 2D Matrix",
        difficulty: "Medium",
        leetcode: 74,
        description:
          "Given an m×n matrix where each row is sorted and the first element of each row is greater than the last of the previous row, determine if a target exists in the matrix.",
        examples: [
          { input: "matrix = [[1,3,5,7],[10,11,16,20],[23,30,34,60]], target = 3", output: "true",  explanation: "3 is at row 0, col 1" },
          { input: "matrix = [[1,3,5,7],[10,11,16,20],[23,30,34,60]], target = 13", output: "false", explanation: "13 is not in the matrix" },
        ],
        approach:
          "Treat the matrix as a flattened sorted array of m×n elements. Binary search over indices 0 to m×n-1. Map index i to matrix[i/cols][i%cols]. This runs in O(log(m×n)) with no extra space.",
        complexity: { time: "O(log(m×n))", space: "O(1)" },
        code: `package main

import "fmt"

func searchMatrix(matrix [][]int, target int) bool {
	m, n := len(matrix), len(matrix[0])
	left, right := 0, m*n-1
	for left <= right {
		mid := left + (right-left)/2
		val := matrix[mid/n][mid%n]
		if val == target {
			return true
		} else if val < target {
			left = mid + 1
		} else {
			right = mid - 1
		}
	}
	return false
}

func main() {
	matrix := [][]int{{1, 3, 5, 7}, {10, 11, 16, 20}, {23, 30, 34, 60}}

	fmt.Println(searchMatrix(matrix, 3))
	// Output: true

	fmt.Println(searchMatrix(matrix, 13))
	// Output: false
}`,
      },
      {
        id: "koko-eating-bananas",
        title: "Koko Eating Bananas",
        difficulty: "Medium",
        leetcode: 875,
        description:
          "Koko has piles of bananas and h hours. She eats at speed k bananas/hour (one pile per hour, leftover discarded). Find the minimum k to finish all piles within h hours.",
        examples: [
          { input: "piles = [3,6,7,11], h = 8", output: "4", explanation: "At speed 4: ceil(3/4)+ceil(6/4)+ceil(7/4)+ceil(11/4) = 1+2+2+3 = 8 hours" },
          { input: "piles = [30,11,23,4,20], h = 5", output: "30", explanation: "Must eat the largest pile in one hour" },
        ],
        approach:
          "Binary search on the answer k in range [1, max(piles)]. For a given k, compute total hours = sum of ceil(pile/k). If hours ≤ h, k might be valid — try smaller. If hours > h, k is too slow — go larger.",
        complexity: { time: "O(n log m) where m = max pile", space: "O(1)" },
        code: `package main

import "fmt"

func minEatingSpeed(piles []int, h int) int {
	left, right := 1, 0
	for _, p := range piles {
		if p > right {
			right = p
		}
	}
	for left < right {
		mid := left + (right-left)/2
		hours := 0
		for _, p := range piles {
			hours += (p + mid - 1) / mid // ceil(p/mid)
		}
		if hours <= h {
			right = mid
		} else {
			left = mid + 1
		}
	}
	return left
}

func main() {
	fmt.Println(minEatingSpeed([]int{3, 6, 7, 11}, 8))
	// Output: 4

	fmt.Println(minEatingSpeed([]int{30, 11, 23, 4, 20}, 5))
	// Output: 30

	fmt.Println(minEatingSpeed([]int{312884470}, 312884469))
	// Output: 2
}`,
      },
      {
        id: "find-peak-element",
        title: "Find Peak Element",
        difficulty: "Medium",
        leetcode: 162,
        description:
          "A peak element is one that is strictly greater than its neighbours. Given an array, return the index of any peak element. Must run in O(log n).",
        examples: [
          { input: "nums = [1,2,3,1]",     output: "2", explanation: "nums[2]=3 is a peak" },
          { input: "nums = [1,2,1,3,5,6,4]", output: "5", explanation: "nums[5]=6 is one valid peak" },
        ],
        approach:
          "Binary search: if nums[mid] < nums[mid+1] the right side has a peak — go right. Otherwise the left side (including mid) has a peak — go left. When left==right we are at a peak.",
        complexity: { time: "O(log n)", space: "O(1)" },
        code: `package main

import "fmt"

func findPeakElement(nums []int) int {
	left, right := 0, len(nums)-1
	for left < right {
		mid := left + (right-left)/2
		if nums[mid] < nums[mid+1] {
			left = mid + 1
		} else {
			right = mid
		}
	}
	return left
}

func main() {
	fmt.Println(findPeakElement([]int{1, 2, 3, 1}))
	// Output: 2

	fmt.Println(findPeakElement([]int{1, 2, 1, 3, 5, 6, 4}))
	// Output: 5

	fmt.Println(findPeakElement([]int{1}))
	// Output: 0
}`,
      },
      {
        id: "capacity-ship-packages",
        title: "Capacity To Ship Packages Within D Days",
        difficulty: "Medium",
        leetcode: 1011,
        description:
          "Given package weights and D days, find the minimum ship capacity to ship all packages in D days. Packages must be shipped in order.",
        examples: [
          { input: "weights = [1,2,3,4,5,6,7,8,9,10], days = 5", output: "15", explanation: "Ship [1-5],[6-7],[8],[9],[10] — max load 15" },
          { input: "weights = [3,2,2,4,1,4], days = 3",           output: "6",  explanation: "Minimum capacity 6 ships all in 3 days" },
        ],
        approach:
          "Binary search on capacity in range [max(weights), sum(weights)]. For a given capacity, greedily simulate: accumulate weights until adding the next would exceed capacity, then start a new day. Count days needed and compare to D.",
        complexity: { time: "O(n log(sum-max))", space: "O(1)" },
        code: `package main

import "fmt"

func shipWithinDays(weights []int, days int) int {
	left, right := 0, 0
	for _, w := range weights {
		if w > left {
			left = w
		}
		right += w
	}
	for left < right {
		mid := left + (right-left)/2
		need, load := 1, 0
		for _, w := range weights {
			if load+w > mid {
				need++
				load = 0
			}
			load += w
		}
		if need <= days {
			right = mid
		} else {
			left = mid + 1
		}
	}
	return left
}

func main() {
	fmt.Println(shipWithinDays([]int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}, 5))
	// Output: 15

	fmt.Println(shipWithinDays([]int{3, 2, 2, 4, 1, 4}, 3))
	// Output: 6

	fmt.Println(shipWithinDays([]int{1, 2, 3, 1, 1}, 4))
	// Output: 3
}`,
      },
      {
        id: "split-array-largest-sum",
        title: "Split Array Largest Sum",
        difficulty: "Hard",
        leetcode: 410,
        description:
          "Given an array nums and integer k, split nums into k non-empty subarrays to minimize the largest subarray sum. Return that minimized largest sum.",
        examples: [
          { input: "nums = [7,2,5,10,8], k = 2", output: "18", explanation: "Split [7,2,5] and [10,8] — max sum = 18" },
          { input: "nums = [1,2,3,4,5], k = 2",  output: "9",  explanation: "Split [1,2,3] and [4,5] — max sum = 9" },
        ],
        approach:
          "Binary search on the answer (the largest subarray sum) in range [max(nums), sum(nums)]. For a given limit, greedily count how many subarrays are needed. If the count ≤ k, the limit might be feasible — try smaller. This is the same logic as shipping packages.",
        complexity: { time: "O(n log(sum-max))", space: "O(1)" },
        code: `package main

import "fmt"

func splitArray(nums []int, k int) int {
	left, right := 0, 0
	for _, v := range nums {
		if v > left {
			left = v
		}
		right += v
	}
	for left < right {
		mid := left + (right-left)/2
		parts, curr := 1, 0
		for _, v := range nums {
			if curr+v > mid {
				parts++
				curr = 0
			}
			curr += v
		}
		if parts <= k {
			right = mid
		} else {
			left = mid + 1
		}
	}
	return left
}

func main() {
	fmt.Println(splitArray([]int{7, 2, 5, 10, 8}, 2))
	// Output: 18

	fmt.Println(splitArray([]int{1, 2, 3, 4, 5}, 2))
	// Output: 9

	fmt.Println(splitArray([]int{2, 3, 1, 2, 4, 3}, 5))
	// Output: 4
}`,
      },
      {
        id: "median-two-sorted-arrays",
        title: "Median of Two Sorted Arrays",
        difficulty: "Hard",
        leetcode: 4,
        description:
          "Given two sorted arrays nums1 and nums2, return the median of the two sorted arrays combined. Must run in O(log(m+n)).",
        examples: [
          { input: "nums1 = [1,3], nums2 = [2]",     output: "2.0", explanation: "Merged [1,2,3], median = 2" },
          { input: "nums1 = [1,2], nums2 = [3,4]",   output: "2.5", explanation: "Merged [1,2,3,4], median = (2+3)/2 = 2.5" },
        ],
        approach:
          "Binary search on the partition of the smaller array. A valid partition satisfies maxLeft1 ≤ minRight2 and maxLeft2 ≤ minRight1. Compute the median from the four boundary values. Always binary search on the smaller array for O(log(min(m,n))).",
        complexity: { time: "O(log(min(m,n)))", space: "O(1)" },
        code: `package main

import (
	"fmt"
	"math"
)

func findMedianSortedArrays(nums1 []int, nums2 []int) float64 {
	// ensure nums1 is the smaller array
	if len(nums1) > len(nums2) {
		nums1, nums2 = nums2, nums1
	}
	m, n := len(nums1), len(nums2)
	half := (m + n + 1) / 2
	left, right := 0, m

	for left <= right {
		i := left + (right-left)/2 // partition in nums1
		j := half - i              // partition in nums2

		maxLeft1, minRight1 := math.MinInt64, math.MaxInt64
		maxLeft2, minRight2 := math.MinInt64, math.MaxInt64

		if i > 0 { maxLeft1 = nums1[i-1] }
		if i < m { minRight1 = nums1[i] }
		if j > 0 { maxLeft2 = nums2[j-1] }
		if j < n { minRight2 = nums2[j] }

		if maxLeft1 <= minRight2 && maxLeft2 <= minRight1 {
			if (m+n)%2 == 1 {
				return float64(max(maxLeft1, maxLeft2))
			}
			return float64(max(maxLeft1, maxLeft2)+min(minRight1, minRight2)) / 2.0
		} else if maxLeft1 > minRight2 {
			right = i - 1
		} else {
			left = i + 1
		}
	}
	return 0
}

func max(a, b int) int {
	if a > b { return a }
	return b
}
func min(a, b int) int {
	if a < b { return a }
	return b
}

func main() {
	fmt.Println(findMedianSortedArrays([]int{1, 3}, []int{2}))
	// Output: 2

	fmt.Println(findMedianSortedArrays([]int{1, 2}, []int{3, 4}))
	// Output: 2.5
}`,
      },
      {
        id: "first-bad-version",
        title: "First Bad Version",
        difficulty: "Easy",
        leetcode: 278,
        description:
          "You have n versions [1..n] and some first bad version causes all subsequent versions to be bad. Using an API isBadVersion(version), find the first bad version with minimum API calls.",
        examples: [
          { input: "n = 5, bad = 4", output: "4", explanation: "isBadVersion(3)=false, isBadVersion(4)=true → first bad is 4" },
          { input: "n = 1, bad = 1", output: "1", explanation: "Only version is bad" },
        ],
        approach:
          "Binary search: if isBadVersion(mid) is true, the first bad might be mid or earlier — move right to mid. If false, the first bad is after mid — move left to mid+1. When left==right we have the first bad version.",
        complexity: { time: "O(log n)", space: "O(1)" },
        code: `package main

import "fmt"

// Simulated API
var firstBad int

func isBadVersion(version int) bool {
	return version >= firstBad
}

func firstBadVersion(n int) int {
	left, right := 1, n
	for left < right {
		mid := left + (right-left)/2
		if isBadVersion(mid) {
			right = mid
		} else {
			left = mid + 1
		}
	}
	return left
}

func main() {
	firstBad = 4
	fmt.Println(firstBadVersion(5))
	// Output: 4

	firstBad = 1
	fmt.Println(firstBadVersion(1))
	// Output: 1

	firstBad = 6
	fmt.Println(firstBadVersion(10))
	// Output: 6
}`,
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // 7. Linked List
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "linked-list",
    icon: "🔗",
    title: "Linked List",
    problems: [
      {
        id: "reverse-linked-list",
        title: "Reverse Linked List",
        difficulty: "Easy",
        leetcode: 206,
        description:
          "Given the head of a singly linked list, reverse the list and return the new head.",
        examples: [
          { input: "head = [1,2,3,4,5]", output: "[5,4,3,2,1]", explanation: "List reversed in place" },
          { input: "head = [1,2]",       output: "[2,1]",        explanation: "Two-node list reversed" },
        ],
        approach:
          "Iterative three-pointer: prev=nil, curr=head. Each step: save curr.next, point curr.next to prev, advance prev to curr, advance curr to saved next. When curr is nil, prev is the new head.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

type ListNode struct {
	Val  int
	Next *ListNode
}

func reverseList(head *ListNode) *ListNode {
	var prev *ListNode
	curr := head
	for curr != nil {
		next := curr.Next
		curr.Next = prev
		prev = curr
		curr = next
	}
	return prev
}

// helpers
func makeList(vals []int) *ListNode {
	dummy := &ListNode{}
	cur := dummy
	for _, v := range vals {
		cur.Next = &ListNode{Val: v}
		cur = cur.Next
	}
	return dummy.Next
}

func printList(head *ListNode) {
	for head != nil {
		fmt.Print(head.Val)
		if head.Next != nil {
			fmt.Print("->")
		}
		head = head.Next
	}
	fmt.Println()
}

func main() {
	printList(reverseList(makeList([]int{1, 2, 3, 4, 5})))
	// Output: 5->4->3->2->1

	printList(reverseList(makeList([]int{1, 2})))
	// Output: 2->1
}`,
      },
      {
        id: "merge-two-sorted-lists",
        title: "Merge Two Sorted Lists",
        difficulty: "Easy",
        leetcode: 21,
        description:
          "Given the heads of two sorted linked lists, merge them into one sorted list and return its head.",
        examples: [
          { input: "l1 = [1,2,4], l2 = [1,3,4]", output: "[1,1,2,3,4,4]", explanation: "Interleaved in sorted order" },
          { input: "l1 = [], l2 = [0]",           output: "[0]",            explanation: "Empty list merges cleanly" },
        ],
        approach:
          "Use a dummy head to simplify edge cases. Compare the two current nodes, attach the smaller one to the result, advance that pointer. When one list is exhausted, attach the remainder of the other.",
        complexity: { time: "O(m+n)", space: "O(1)" },
        code: `package main

import "fmt"

type ListNode struct {
	Val  int
	Next *ListNode
}

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
	if l1 != nil {
		cur.Next = l1
	} else {
		cur.Next = l2
	}
	return dummy.Next
}

func makeList(vals []int) *ListNode {
	dummy := &ListNode{}
	cur := dummy
	for _, v := range vals {
		cur.Next = &ListNode{Val: v}
		cur = cur.Next
	}
	return dummy.Next
}

func printList(head *ListNode) {
	for head != nil {
		fmt.Print(head.Val)
		if head.Next != nil { fmt.Print("->") }
		head = head.Next
	}
	fmt.Println()
}

func main() {
	printList(mergeTwoLists(makeList([]int{1, 2, 4}), makeList([]int{1, 3, 4})))
	// Output: 1->1->2->3->4->4

	printList(mergeTwoLists(nil, makeList([]int{0})))
	// Output: 0
}`,
      },
      {
        id: "linked-list-cycle",
        title: "Linked List Cycle",
        difficulty: "Easy",
        leetcode: 141,
        description:
          "Given the head of a linked list, return true if it has a cycle (a node whose next pointer points back to an earlier node).",
        examples: [
          { input: "head = [3,2,0,-4], pos = 1", output: "true",  explanation: "Tail connects back to node at index 1" },
          { input: "head = [1,2], pos = -1",      output: "false", explanation: "No cycle" },
        ],
        approach:
          "Floyd's cycle detection: slow pointer moves 1 step, fast moves 2. If they ever meet, there is a cycle. If fast reaches nil, no cycle. The key insight: in a cycle fast laps slow, so they must meet.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

type ListNode struct {
	Val  int
	Next *ListNode
}

func hasCycle(head *ListNode) bool {
	slow, fast := head, head
	for fast != nil && fast.Next != nil {
		slow = slow.Next
		fast = fast.Next.Next
		if slow == fast {
			return true
		}
	}
	return false
}

func main() {
	// Build: 3->2->0->-4, with -4 pointing back to 2
	nodes := []*ListNode{{Val: 3}, {Val: 2}, {Val: 0}, {Val: -4}}
	nodes[0].Next = nodes[1]
	nodes[1].Next = nodes[2]
	nodes[2].Next = nodes[3]
	nodes[3].Next = nodes[1] // cycle

	fmt.Println(hasCycle(nodes[0]))
	// Output: true

	// No cycle
	a := &ListNode{Val: 1, Next: &ListNode{Val: 2}}
	fmt.Println(hasCycle(a))
	// Output: false
}`,
      },
      {
        id: "remove-nth-node-from-end",
        title: "Remove Nth Node From End of List",
        difficulty: "Medium",
        leetcode: 19,
        description:
          "Given the head of a linked list, remove the nth node from the end and return the head. Do it in one pass.",
        examples: [
          { input: "head = [1,2,3,4,5], n = 2", output: "[1,2,3,5]", explanation: "Remove 4 (2nd from end)" },
          { input: "head = [1], n = 1",          output: "[]",         explanation: "Remove the only node" },
        ],
        approach:
          "Two pointers with a gap of n. Advance fast n+1 steps ahead from a dummy node. Then move both until fast is nil — slow is just before the target node. Unlink it by setting slow.next = slow.next.next.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

type ListNode struct {
	Val  int
	Next *ListNode
}

func removeNthFromEnd(head *ListNode, n int) *ListNode {
	dummy := &ListNode{Next: head}
	fast, slow := dummy, dummy
	for i := 0; i <= n; i++ {
		fast = fast.Next
	}
	for fast != nil {
		fast = fast.Next
		slow = slow.Next
	}
	slow.Next = slow.Next.Next
	return dummy.Next
}

func makeList(vals []int) *ListNode {
	dummy := &ListNode{}
	cur := dummy
	for _, v := range vals {
		cur.Next = &ListNode{Val: v}
		cur = cur.Next
	}
	return dummy.Next
}

func printList(head *ListNode) {
	for head != nil {
		fmt.Print(head.Val)
		if head.Next != nil { fmt.Print("->") }
		head = head.Next
	}
	fmt.Println()
}

func main() {
	printList(removeNthFromEnd(makeList([]int{1, 2, 3, 4, 5}), 2))
	// Output: 1->2->3->5

	printList(removeNthFromEnd(makeList([]int{1}), 1))
	// Output: (empty)
}`,
      },
      {
        id: "reorder-list",
        title: "Reorder List",
        difficulty: "Medium",
        leetcode: 143,
        description:
          "Given a linked list L0→L1→…→Ln, reorder it to L0→Ln→L1→Ln-1→L2→Ln-2→… in-place.",
        examples: [
          { input: "head = [1,2,3,4]",   output: "[1,4,2,3]",   explanation: "Interleave from front and back" },
          { input: "head = [1,2,3,4,5]", output: "[1,5,2,4,3]", explanation: "Middle node stays in place" },
        ],
        approach:
          "Three steps: (1) Find the middle using slow/fast pointers. (2) Reverse the second half. (3) Merge the two halves by interleaving — take one node from each alternately.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

type ListNode struct {
	Val  int
	Next *ListNode
}

func reorderList(head *ListNode) {
	if head == nil || head.Next == nil {
		return
	}
	// Step 1: find middle
	slow, fast := head, head
	for fast.Next != nil && fast.Next.Next != nil {
		slow = slow.Next
		fast = fast.Next.Next
	}
	// Step 2: reverse second half
	second := slow.Next
	slow.Next = nil
	var prev *ListNode
	for second != nil {
		next := second.Next
		second.Next = prev
		prev = second
		second = next
	}
	// Step 3: merge two halves
	first, second := head, prev
	for second != nil {
		tmp1, tmp2 := first.Next, second.Next
		first.Next = second
		second.Next = tmp1
		first = tmp1
		second = tmp2
	}
}

func makeList(vals []int) *ListNode {
	dummy := &ListNode{}
	cur := dummy
	for _, v := range vals {
		cur.Next = &ListNode{Val: v}
		cur = cur.Next
	}
	return dummy.Next
}

func printList(head *ListNode) {
	for head != nil {
		fmt.Print(head.Val)
		if head.Next != nil { fmt.Print("->") }
		head = head.Next
	}
	fmt.Println()
}

func main() {
	l1 := makeList([]int{1, 2, 3, 4})
	reorderList(l1)
	printList(l1)
	// Output: 1->4->2->3

	l2 := makeList([]int{1, 2, 3, 4, 5})
	reorderList(l2)
	printList(l2)
	// Output: 1->5->2->4->3
}`,
      },
      {
        id: "add-two-numbers",
        title: "Add Two Numbers",
        difficulty: "Medium",
        leetcode: 2,
        description:
          "Two non-empty linked lists represent two non-negative integers stored in reverse order. Add the two numbers and return the sum as a linked list in reverse order.",
        examples: [
          { input: "l1 = [2,4,3], l2 = [5,6,4]", output: "[7,0,8]", explanation: "342 + 465 = 807, stored as 7->0->8" },
          { input: "l1 = [9,9,9,9], l2 = [9,9,9]", output: "[8,9,9,0,1]", explanation: "9999 + 999 = 10998" },
        ],
        approach:
          "Simulate grade-school addition. Walk both lists simultaneously, summing digits and a carry. If one list is shorter, treat missing digits as 0. After both lists are exhausted, if carry remains, append a new node.",
        complexity: { time: "O(max(m,n))", space: "O(max(m,n))" },
        code: `package main

import "fmt"

type ListNode struct {
	Val  int
	Next *ListNode
}

func addTwoNumbers(l1, l2 *ListNode) *ListNode {
	dummy := &ListNode{}
	cur := dummy
	carry := 0
	for l1 != nil || l2 != nil || carry != 0 {
		sum := carry
		if l1 != nil {
			sum += l1.Val
			l1 = l1.Next
		}
		if l2 != nil {
			sum += l2.Val
			l2 = l2.Next
		}
		carry = sum / 10
		cur.Next = &ListNode{Val: sum % 10}
		cur = cur.Next
	}
	return dummy.Next
}

func makeList(vals []int) *ListNode {
	dummy := &ListNode{}
	cur := dummy
	for _, v := range vals {
		cur.Next = &ListNode{Val: v}
		cur = cur.Next
	}
	return dummy.Next
}

func printList(head *ListNode) {
	for head != nil {
		fmt.Print(head.Val)
		if head.Next != nil { fmt.Print("->") }
		head = head.Next
	}
	fmt.Println()
}

func main() {
	printList(addTwoNumbers(makeList([]int{2, 4, 3}), makeList([]int{5, 6, 4})))
	// Output: 7->0->8  (342+465=807)

	printList(addTwoNumbers(makeList([]int{9, 9, 9, 9}), makeList([]int{9, 9, 9})))
	// Output: 8->9->9->0->1  (9999+999=10998)
}`,
      },
      {
        id: "copy-list-random-pointer",
        title: "Copy List with Random Pointer",
        difficulty: "Medium",
        leetcode: 138,
        description:
          "A linked list where each node has a next and a random pointer (which can point to any node or null). Return a deep copy of the list.",
        examples: [
          { input: "head = [[7,null],[13,0],[11,4],[10,2],[1,0]]", output: "Deep copy with same structure", explanation: "Each node's random pointer index is preserved" },
        ],
        approach:
          "Two passes using a hash map. Pass 1: create a clone for every original node (map original → clone). Pass 2: wire up each clone's next and random using the map. O(n) time and space.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

type Node struct {
	Val    int
	Next   *Node
	Random *Node
}

func copyRandomList(head *Node) *Node {
	if head == nil {
		return nil
	}
	cloneMap := make(map[*Node]*Node)

	// Pass 1: create all clone nodes
	cur := head
	for cur != nil {
		cloneMap[cur] = &Node{Val: cur.Val}
		cur = cur.Next
	}

	// Pass 2: wire next and random
	cur = head
	for cur != nil {
		cloneMap[cur].Next = cloneMap[cur.Next]
		cloneMap[cur].Random = cloneMap[cur.Random]
		cur = cur.Next
	}
	return cloneMap[head]
}

func main() {
	// Build: 1 -random-> 2, 2 -random-> 1
	n1 := &Node{Val: 1}
	n2 := &Node{Val: 2}
	n1.Next = n2
	n1.Random = n2
	n2.Random = n1

	copy := copyRandomList(n1)
	fmt.Println(copy.Val, copy.Next.Val)
	// Output: 1 2
	fmt.Println(copy.Random == copy.Next) // random of 1 points to clone of 2
	// Output: true
	fmt.Println(copy.Next.Random == copy) // random of 2 points to clone of 1
	// Output: true
}`,
      },
      {
        id: "palindrome-linked-list",
        title: "Palindrome Linked List",
        difficulty: "Easy",
        leetcode: 234,
        description:
          "Given the head of a singly linked list, return true if it is a palindrome.",
        examples: [
          { input: "head = [1,2,2,1]", output: "true",  explanation: "Reads the same forwards and backwards" },
          { input: "head = [1,2]",     output: "false", explanation: "1,2 is not a palindrome" },
        ],
        approach:
          "Find the middle with slow/fast pointers. Reverse the second half. Compare the first half with the reversed second half node by node. Restore the list if needed (optional here).",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

type ListNode struct {
	Val  int
	Next *ListNode
}

func isPalindrome(head *ListNode) bool {
	// Find middle
	slow, fast := head, head
	for fast != nil && fast.Next != nil {
		slow = slow.Next
		fast = fast.Next.Next
	}
	// Reverse second half
	var prev *ListNode
	cur := slow
	for cur != nil {
		next := cur.Next
		cur.Next = prev
		prev = cur
		cur = next
	}
	// Compare
	left, right := head, prev
	for right != nil {
		if left.Val != right.Val {
			return false
		}
		left = left.Next
		right = right.Next
	}
	return true
}

func makeList(vals []int) *ListNode {
	dummy := &ListNode{}
	cur := dummy
	for _, v := range vals {
		cur.Next = &ListNode{Val: v}
		cur = cur.Next
	}
	return dummy.Next
}

func main() {
	fmt.Println(isPalindrome(makeList([]int{1, 2, 2, 1})))
	// Output: true

	fmt.Println(isPalindrome(makeList([]int{1, 2})))
	// Output: false

	fmt.Println(isPalindrome(makeList([]int{1, 2, 3, 2, 1})))
	// Output: true
}`,
      },
      {
        id: "lru-cache",
        title: "LRU Cache",
        difficulty: "Medium",
        leetcode: 146,
        description:
          "Design a data structure for a Least Recently Used cache with get and put operations, both in O(1). Evict the least recently used item when capacity is exceeded.",
        examples: [
          { input: "LRUCache(2), put(1,1), put(2,2), get(1), put(3,3), get(2), put(4,4), get(1), get(3), get(4)", output: "1, -1, -1, 3, 4", explanation: "Key 2 evicted after key 3 inserted; key 1 evicted after key 4 inserted" },
        ],
        approach:
          "Combine a doubly-linked list (tracks recency order) with a hash map (key → node pointer). get: move node to front, return value. put: if exists move to front and update; if new insert at front, evict tail if over capacity.",
        complexity: { time: "O(1) get and put", space: "O(capacity)" },
        code: `package main

import "fmt"

type Node struct {
	key, val   int
	prev, next *Node
}

type LRUCache struct {
	cap        int
	cache      map[int]*Node
	head, tail *Node // sentinels
}

func Constructor(capacity int) LRUCache {
	head, tail := &Node{}, &Node{}
	head.next = tail
	tail.prev = head
	return LRUCache{cap: capacity, cache: make(map[int]*Node), head: head, tail: tail}
}

func (c *LRUCache) remove(n *Node) {
	n.prev.next, n.next.prev = n.next, n.prev
}

func (c *LRUCache) insertFront(n *Node) {
	n.next = c.head.next
	n.prev = c.head
	c.head.next.prev = n
	c.head.next = n
}

func (c *LRUCache) Get(key int) int {
	if n, ok := c.cache[key]; ok {
		c.remove(n)
		c.insertFront(n)
		return n.val
	}
	return -1
}

func (c *LRUCache) Put(key, value int) {
	if n, ok := c.cache[key]; ok {
		n.val = value
		c.remove(n)
		c.insertFront(n)
		return
	}
	n := &Node{key: key, val: value}
	c.cache[key] = n
	c.insertFront(n)
	if len(c.cache) > c.cap {
		lru := c.tail.prev
		c.remove(lru)
		delete(c.cache, lru.key)
	}
}

func main() {
	cache := Constructor(2)
	cache.Put(1, 1)
	cache.Put(2, 2)
	fmt.Println(cache.Get(1)) // Output: 1
	cache.Put(3, 3)           // evicts key 2
	fmt.Println(cache.Get(2)) // Output: -1
	cache.Put(4, 4)           // evicts key 1
	fmt.Println(cache.Get(1)) // Output: -1
	fmt.Println(cache.Get(3)) // Output: 3
	fmt.Println(cache.Get(4)) // Output: 4
}`,
      },
      {
        id: "merge-k-sorted-lists",
        title: "Merge K Sorted Lists",
        difficulty: "Hard",
        leetcode: 23,
        description:
          "Given an array of k sorted linked lists, merge all of them into one sorted linked list and return its head.",
        examples: [
          { input: "lists = [[1,4,5],[1,3,4],[2,6]]", output: "[1,1,2,3,4,4,5,6]", explanation: "All three lists merged and sorted" },
          { input: "lists = []",                       output: "[]",                 explanation: "Empty input" },
        ],
        approach:
          "Divide and conquer: repeatedly merge pairs of lists. Each round halves the number of lists. Merging two sorted lists is O(n). Total: O(n log k) where n is total nodes. Avoids the O(nk) cost of merging one at a time.",
        complexity: { time: "O(n log k)", space: "O(log k) recursion" },
        code: `package main

import "fmt"

type ListNode struct {
	Val  int
	Next *ListNode
}

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
	if l1 != nil { cur.Next = l1 } else { cur.Next = l2 }
	return dummy.Next
}

func mergeKLists(lists []*ListNode) *ListNode {
	if len(lists) == 0 {
		return nil
	}
	for len(lists) > 1 {
		merged := []*ListNode{}
		for i := 0; i < len(lists); i += 2 {
			if i+1 < len(lists) {
				merged = append(merged, mergeTwoLists(lists[i], lists[i+1]))
			} else {
				merged = append(merged, lists[i])
			}
		}
		lists = merged
	}
	return lists[0]
}

func makeList(vals []int) *ListNode {
	dummy := &ListNode{}
	cur := dummy
	for _, v := range vals {
		cur.Next = &ListNode{Val: v}
		cur = cur.Next
	}
	return dummy.Next
}

func printList(head *ListNode) {
	for head != nil {
		fmt.Print(head.Val)
		if head.Next != nil { fmt.Print("->") }
		head = head.Next
	}
	fmt.Println()
}

func main() {
	lists := []*ListNode{
		makeList([]int{1, 4, 5}),
		makeList([]int{1, 3, 4}),
		makeList([]int{2, 6}),
	}
	printList(mergeKLists(lists))
	// Output: 1->1->2->3->4->4->5->6
}`,
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // 8. Trees
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "trees",
    icon: "🌳",
    title: "Trees",
    problems: [
      {
        id: "invert-binary-tree",
        title: "Invert Binary Tree",
        difficulty: "Easy",
        leetcode: 226,
        description:
          "Given the root of a binary tree, invert the tree (mirror it) and return its root.",
        examples: [
          { input: "root = [4,2,7,1,3,6,9]", output: "[4,7,2,9,6,3,1]", explanation: "Every left and right child is swapped at every level" },
          { input: "root = [2,1,3]",          output: "[2,3,1]",          explanation: "Children of root swapped" },
        ],
        approach:
          "Recursively swap the left and right children of every node. Base case: nil node returns nil. Post-order or pre-order both work — swap first, then recurse (or recurse then swap).",
        complexity: { time: "O(n)", space: "O(h) where h = height" },
        code: `package main

import "fmt"

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

func invertTree(root *TreeNode) *TreeNode {
	if root == nil {
		return nil
	}
	root.Left, root.Right = invertTree(root.Right), invertTree(root.Left)
	return root
}

func inorder(root *TreeNode) {
	if root == nil { return }
	inorder(root.Left)
	fmt.Print(root.Val, " ")
	inorder(root.Right)
}

func main() {
	//       4
	//      / \\
	//     2   7
	//    / \\ / \\
	//   1  3 6  9
	root := &TreeNode{Val: 4,
		Left:  &TreeNode{Val: 2, Left: &TreeNode{Val: 1}, Right: &TreeNode{Val: 3}},
		Right: &TreeNode{Val: 7, Left: &TreeNode{Val: 6}, Right: &TreeNode{Val: 9}},
	}
	invertTree(root)
	inorder(root)
	fmt.Println()
	// Output (inorder of inverted): 9 7 6 4 3 2 1
}`,
      },
      {
        id: "maximum-depth-binary-tree",
        title: "Maximum Depth of Binary Tree",
        difficulty: "Easy",
        leetcode: 104,
        description:
          "Given the root of a binary tree, return its maximum depth — the number of nodes along the longest path from the root to the farthest leaf.",
        examples: [
          { input: "root = [3,9,20,null,null,15,7]", output: "3", explanation: "Longest path: 3→20→15 or 3→20→7" },
          { input: "root = [1,null,2]",               output: "2", explanation: "Path: 1→2" },
        ],
        approach:
          "DFS recursion: depth of a node = 1 + max(depth(left), depth(right)). Base case: nil returns 0. Alternatively use BFS and count levels.",
        complexity: { time: "O(n)", space: "O(h)" },
        code: `package main

import "fmt"

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

func maxDepth(root *TreeNode) int {
	if root == nil {
		return 0
	}
	left := maxDepth(root.Left)
	right := maxDepth(root.Right)
	if left > right {
		return 1 + left
	}
	return 1 + right
}

func main() {
	//     3
	//    / \\
	//   9  20
	//      / \\
	//     15   7
	root := &TreeNode{Val: 3,
		Left: &TreeNode{Val: 9},
		Right: &TreeNode{Val: 20,
			Left:  &TreeNode{Val: 15},
			Right: &TreeNode{Val: 7},
		},
	}
	fmt.Println(maxDepth(root))
	// Output: 3

	root2 := &TreeNode{Val: 1, Right: &TreeNode{Val: 2}}
	fmt.Println(maxDepth(root2))
	// Output: 2
}`,
      },
      {
        id: "balanced-binary-tree",
        title: "Balanced Binary Tree",
        difficulty: "Easy",
        leetcode: 110,
        description:
          "Given a binary tree, determine if it is height-balanced — for every node the heights of its left and right subtrees differ by at most 1.",
        examples: [
          { input: "root = [3,9,20,null,null,15,7]", output: "true",  explanation: "All subtrees are balanced" },
          { input: "root = [1,2,2,3,3,null,null,4,4]", output: "false", explanation: "Left subtree is too deep" },
        ],
        approach:
          "Single-pass DFS: return -1 if a subtree is unbalanced, otherwise return its height. At each node, if either child returns -1 or the height difference > 1, propagate -1 upward immediately. Avoids recomputing heights.",
        complexity: { time: "O(n)", space: "O(h)" },
        code: `package main

import "fmt"

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

func height(root *TreeNode) int {
	if root == nil {
		return 0
	}
	left := height(root.Left)
	if left == -1 { return -1 }
	right := height(root.Right)
	if right == -1 { return -1 }

	diff := left - right
	if diff < -1 || diff > 1 {
		return -1 // unbalanced
	}
	if left > right { return 1 + left }
	return 1 + right
}

func isBalanced(root *TreeNode) bool {
	return height(root) != -1
}

func main() {
	root := &TreeNode{Val: 3,
		Left: &TreeNode{Val: 9},
		Right: &TreeNode{Val: 20,
			Left:  &TreeNode{Val: 15},
			Right: &TreeNode{Val: 7},
		},
	}
	fmt.Println(isBalanced(root))
	// Output: true

	root2 := &TreeNode{Val: 1,
		Left: &TreeNode{Val: 2,
			Left: &TreeNode{Val: 3,
				Left:  &TreeNode{Val: 4},
				Right: &TreeNode{Val: 4},
			},
			Right: &TreeNode{Val: 3},
		},
		Right: &TreeNode{Val: 2},
	}
	fmt.Println(isBalanced(root2))
	// Output: false
}`,
      },
      {
        id: "diameter-binary-tree",
        title: "Diameter of Binary Tree",
        difficulty: "Easy",
        leetcode: 543,
        description:
          "Given the root of a binary tree, return the length of the diameter — the longest path between any two nodes (measured in edges, not nodes). The path may not pass through the root.",
        examples: [
          { input: "root = [1,2,3,4,5]", output: "3", explanation: "Longest path [4,2,1,3] or [5,2,1,3] has 3 edges" },
          { input: "root = [1,2]",        output: "1", explanation: "Path [2,1] has 1 edge" },
        ],
        approach:
          "DFS that returns the height of each subtree. At each node compute left_height + right_height (the diameter through that node) and update a global best. Return 1 + max(left, right) as the height.",
        complexity: { time: "O(n)", space: "O(h)" },
        code: `package main

import "fmt"

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

func diameterOfBinaryTree(root *TreeNode) int {
	best := 0
	var dfs func(*TreeNode) int
	dfs = func(node *TreeNode) int {
		if node == nil {
			return 0
		}
		left := dfs(node.Left)
		right := dfs(node.Right)
		if left+right > best {
			best = left + right
		}
		if left > right { return 1 + left }
		return 1 + right
	}
	dfs(root)
	return best
}

func main() {
	//     1
	//    / \\
	//   2   3
	//  / \\
	// 4   5
	root := &TreeNode{Val: 1,
		Left:  &TreeNode{Val: 2, Left: &TreeNode{Val: 4}, Right: &TreeNode{Val: 5}},
		Right: &TreeNode{Val: 3},
	}
	fmt.Println(diameterOfBinaryTree(root))
	// Output: 3

	root2 := &TreeNode{Val: 1, Left: &TreeNode{Val: 2}}
	fmt.Println(diameterOfBinaryTree(root2))
	// Output: 1
}`,
      },
      {
        id: "level-order-traversal",
        title: "Binary Tree Level Order Traversal",
        difficulty: "Medium",
        leetcode: 102,
        description:
          "Given the root of a binary tree, return the level-order traversal of its nodes' values as a 2D slice (left to right, level by level).",
        examples: [
          { input: "root = [3,9,20,null,null,15,7]", output: "[[3],[9,20],[15,7]]", explanation: "Three levels captured separately" },
          { input: "root = [1]",                      output: "[[1]]",               explanation: "Single node" },
        ],
        approach:
          "BFS with a queue. At the start of each iteration record the current queue length — that's the width of the current level. Process exactly that many nodes, enqueue their children, and collect values into a level slice.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

func levelOrder(root *TreeNode) [][]int {
	if root == nil {
		return nil
	}
	result := [][]int{}
	queue := []*TreeNode{root}
	for len(queue) > 0 {
		levelSize := len(queue)
		level := make([]int, 0, levelSize)
		for i := 0; i < levelSize; i++ {
			node := queue[0]
			queue = queue[1:]
			level = append(level, node.Val)
			if node.Left != nil  { queue = append(queue, node.Left) }
			if node.Right != nil { queue = append(queue, node.Right) }
		}
		result = append(result, level)
	}
	return result
}

func main() {
	root := &TreeNode{Val: 3,
		Left: &TreeNode{Val: 9},
		Right: &TreeNode{Val: 20,
			Left:  &TreeNode{Val: 15},
			Right: &TreeNode{Val: 7},
		},
	}
	fmt.Println(levelOrder(root))
	// Output: [[3] [9 20] [15 7]]

	fmt.Println(levelOrder(&TreeNode{Val: 1}))
	// Output: [[1]]
}`,
      },
      {
        id: "binary-tree-right-side-view",
        title: "Binary Tree Right Side View",
        difficulty: "Medium",
        leetcode: 199,
        description:
          "Given the root of a binary tree, imagine standing on the right side. Return the values of the nodes visible from the right, top to bottom.",
        examples: [
          { input: "root = [1,2,3,null,5,null,4]", output: "[1,3,4]", explanation: "Rightmost node at each level" },
          { input: "root = [1,null,3]",             output: "[1,3]",   explanation: "Right child visible at every level" },
        ],
        approach:
          "BFS level-order traversal. The last node processed at each level is the rightmost visible node — append it to the result.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import "fmt"

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

func rightSideView(root *TreeNode) []int {
	if root == nil {
		return nil
	}
	result := []int{}
	queue := []*TreeNode{root}
	for len(queue) > 0 {
		size := len(queue)
		for i := 0; i < size; i++ {
			node := queue[0]
			queue = queue[1:]
			if i == size-1 {
				result = append(result, node.Val) // rightmost
			}
			if node.Left != nil  { queue = append(queue, node.Left) }
			if node.Right != nil { queue = append(queue, node.Right) }
		}
	}
	return result
}

func main() {
	root := &TreeNode{Val: 1,
		Left:  &TreeNode{Val: 2, Right: &TreeNode{Val: 5}},
		Right: &TreeNode{Val: 3, Right: &TreeNode{Val: 4}},
	}
	fmt.Println(rightSideView(root))
	// Output: [1 3 4]

	root2 := &TreeNode{Val: 1, Right: &TreeNode{Val: 3}}
	fmt.Println(rightSideView(root2))
	// Output: [1 3]
}`,
      },
      {
        id: "lowest-common-ancestor-bst",
        title: "Lowest Common Ancestor of a BST",
        difficulty: "Medium",
        leetcode: 235,
        description:
          "Given a BST and two nodes p and q, return their lowest common ancestor — the deepest node that has both p and q as descendants (a node is a descendant of itself).",
        examples: [
          { input: "root = [6,2,8,0,4,7,9], p=2, q=8", output: "6", explanation: "6 is the root — both 2 and 8 are in different subtrees" },
          { input: "root = [6,2,8,0,4,7,9], p=2, q=4", output: "2", explanation: "2 is an ancestor of 4, so 2 is the LCA" },
        ],
        approach:
          "Exploit BST property. If both p and q are less than root, LCA is in the left subtree. If both are greater, it's in the right subtree. Otherwise root is the split point — it is the LCA.",
        complexity: { time: "O(h)", space: "O(1)" },
        code: `package main

import "fmt"

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

func lowestCommonAncestor(root, p, q *TreeNode) *TreeNode {
	for root != nil {
		if p.Val < root.Val && q.Val < root.Val {
			root = root.Left
		} else if p.Val > root.Val && q.Val > root.Val {
			root = root.Right
		} else {
			return root // split point — this is the LCA
		}
	}
	return nil
}

func main() {
	//        6
	//       / \\
	//      2   8
	//     / \\ / \\
	//    0  4 7  9
	n0 := &TreeNode{Val: 0}
	n4 := &TreeNode{Val: 4}
	n7 := &TreeNode{Val: 7}
	n9 := &TreeNode{Val: 9}
	n2 := &TreeNode{Val: 2, Left: n0, Right: n4}
	n8 := &TreeNode{Val: 8, Left: n7, Right: n9}
	root := &TreeNode{Val: 6, Left: n2, Right: n8}

	fmt.Println(lowestCommonAncestor(root, n2, n8).Val)
	// Output: 6

	fmt.Println(lowestCommonAncestor(root, n2, n4).Val)
	// Output: 2
}`,
      },
      {
        id: "validate-binary-search-tree",
        title: "Validate Binary Search Tree",
        difficulty: "Medium",
        leetcode: 98,
        description:
          "Given the root of a binary tree, determine if it is a valid BST — every node's value must be strictly greater than all values in its left subtree and strictly less than all values in its right subtree.",
        examples: [
          { input: "root = [2,1,3]",       output: "true",  explanation: "1 < 2 < 3, valid BST" },
          { input: "root = [5,1,4,null,null,3,6]", output: "false", explanation: "Node 4 is in right subtree but 3 < 5" },
        ],
        approach:
          "DFS passing valid range [min, max] for each node. Root is valid in (-∞, +∞). Going left tightens the upper bound to the parent's value; going right tightens the lower bound. Return false if any node falls outside its range.",
        complexity: { time: "O(n)", space: "O(h)" },
        code: `package main

import (
	"fmt"
	"math"
)

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

func isValidBST(root *TreeNode) bool {
	var validate func(node *TreeNode, min, max int) bool
	validate = func(node *TreeNode, min, max int) bool {
		if node == nil {
			return true
		}
		if node.Val <= min || node.Val >= max {
			return false
		}
		return validate(node.Left, min, node.Val) &&
			validate(node.Right, node.Val, max)
	}
	return validate(root, math.MinInt64, math.MaxInt64)
}

func main() {
	root := &TreeNode{Val: 2,
		Left:  &TreeNode{Val: 1},
		Right: &TreeNode{Val: 3},
	}
	fmt.Println(isValidBST(root))
	// Output: true

	root2 := &TreeNode{Val: 5,
		Left: &TreeNode{Val: 1},
		Right: &TreeNode{Val: 4,
			Left:  &TreeNode{Val: 3},
			Right: &TreeNode{Val: 6},
		},
	}
	fmt.Println(isValidBST(root2))
	// Output: false
}`,
      },
      {
        id: "binary-tree-maximum-path-sum",
        title: "Binary Tree Maximum Path Sum",
        difficulty: "Hard",
        leetcode: 124,
        description:
          "Given the root of a binary tree, return the maximum path sum of any non-empty path. A path is a sequence of nodes where each pair is connected, visiting each node at most once.",
        examples: [
          { input: "root = [1,2,3]",             output: "6",  explanation: "Path 2→1→3 sums to 6" },
          { input: "root = [-10,9,20,null,null,15,7]", output: "42", explanation: "Path 15→20→7 sums to 42" },
        ],
        approach:
          "DFS returning the max gain from each node going downward (only one direction). At each node, compute left_gain = max(0, dfs(left)) and right_gain = max(0, dfs(right)). Update global best with node.Val + left_gain + right_gain (path through this node). Return node.Val + max(left_gain, right_gain) upward.",
        complexity: { time: "O(n)", space: "O(h)" },
        code: `package main

import "fmt"

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

func maxPathSum(root *TreeNode) int {
	best := root.Val
	var dfs func(*TreeNode) int
	dfs = func(node *TreeNode) int {
		if node == nil {
			return 0
		}
		left := max(0, dfs(node.Left))
		right := max(0, dfs(node.Right))
		// path through this node
		if node.Val+left+right > best {
			best = node.Val + left + right
		}
		// return best single-branch gain upward
		if left > right { return node.Val + left }
		return node.Val + right
	}
	dfs(root)
	return best
}

func max(a, b int) int {
	if a > b { return a }
	return b
}

func main() {
	root := &TreeNode{Val: 1,
		Left:  &TreeNode{Val: 2},
		Right: &TreeNode{Val: 3},
	}
	fmt.Println(maxPathSum(root))
	// Output: 6

	root2 := &TreeNode{Val: -10,
		Left: &TreeNode{Val: 9},
		Right: &TreeNode{Val: 20,
			Left:  &TreeNode{Val: 15},
			Right: &TreeNode{Val: 7},
		},
	}
	fmt.Println(maxPathSum(root2))
	// Output: 42
}`,
      },
      {
        id: "serialize-deserialize-binary-tree",
        title: "Serialize and Deserialize Binary Tree",
        difficulty: "Hard",
        leetcode: 297,
        description:
          "Design an algorithm to serialize a binary tree to a string and deserialize it back to the original tree structure.",
        examples: [
          { input: "root = [1,2,3,null,null,4,5]", output: "1,2,N,N,3,4,N,N,5,N,N", explanation: "Pre-order with null markers — deserializes back to the same tree" },
        ],
        approach:
          "Pre-order DFS serialization: write node value then recurse left then right. Use 'N' as a null marker separated by commas. Deserialization uses a pointer into the split tokens array, consuming one token per recursive call — the pre-order structure rebuilds the tree perfectly.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `package main

import (
	"fmt"
	"strconv"
	"strings"
)

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

func serialize(root *TreeNode) string {
	var sb strings.Builder
	var dfs func(*TreeNode)
	dfs = func(node *TreeNode) {
		if node == nil {
			sb.WriteString("N,")
			return
		}
		sb.WriteString(strconv.Itoa(node.Val))
		sb.WriteByte(',')
		dfs(node.Left)
		dfs(node.Right)
	}
	dfs(root)
	return sb.String()
}

func deserialize(data string) *TreeNode {
	tokens := strings.Split(data, ",")
	idx := 0
	var dfs func() *TreeNode
	dfs = func() *TreeNode {
		if tokens[idx] == "N" || tokens[idx] == "" {
			idx++
			return nil
		}
		val, _ := strconv.Atoi(tokens[idx])
		idx++
		return &TreeNode{Val: val, Left: dfs(), Right: dfs()}
	}
	return dfs()
}

func inorder(root *TreeNode) {
	if root == nil { return }
	inorder(root.Left)
	fmt.Print(root.Val, " ")
	inorder(root.Right)
}

func main() {
	root := &TreeNode{Val: 1,
		Left:  &TreeNode{Val: 2},
		Right: &TreeNode{Val: 3,
			Left:  &TreeNode{Val: 4},
			Right: &TreeNode{Val: 5},
		},
	}
	s := serialize(root)
	fmt.Println(s)
	// Output: 1,2,N,N,3,4,N,N,5,N,N,

	restored := deserialize(s)
	inorder(restored)
	fmt.Println()
	// Output: 2 1 4 3 5
}`,
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // 9. Graphs
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "graphs",
    icon: "🕸️",
    title: "Graphs",
    problems: [
      {
        id: "number-of-islands",
        title: "Number of Islands",
        difficulty: "Medium",
        leetcode: 200,
        description:
          "Given an m×n grid of '1's (land) and '0's (water), return the number of islands. An island is surrounded by water and formed by connecting adjacent land cells horizontally or vertically.",
        examples: [
          { input: 'grid = [["1","1","0"],["0","1","0"],["0","0","1"]]', output: "2", explanation: "Two separate land masses" },
          { input: 'grid = [["1","1","1"],["0","1","0"],["0","0","1"]]', output: "2", explanation: "Top blob and bottom-right cell" },
        ],
        approach:
          "Iterate every cell. When a '1' is found, increment the island count and run DFS/BFS from that cell, marking all reachable land cells as visited (set to '0'). This ensures each island is counted exactly once.",
        complexity: { time: "O(m×n)", space: "O(m×n)" },
        code: `package main

import "fmt"

func numIslands(grid [][]byte) int {
	count := 0
	for r := 0; r < len(grid); r++ {
		for c := 0; c < len(grid[0]); c++ {
			if grid[r][c] == '1' {
				count++
				dfs(grid, r, c)
			}
		}
	}
	return count
}

func dfs(grid [][]byte, r, c int) {
	if r < 0 || r >= len(grid) || c < 0 || c >= len(grid[0]) || grid[r][c] != '1' {
		return
	}
	grid[r][c] = '0' // mark visited
	dfs(grid, r+1, c)
	dfs(grid, r-1, c)
	dfs(grid, r, c+1)
	dfs(grid, r, c-1)
}

func main() {
	grid := [][]byte{
		{'1', '1', '0'},
		{'0', '1', '0'},
		{'0', '0', '1'},
	}
	fmt.Println(numIslands(grid))
	// Output: 2

	grid2 := [][]byte{
		{'1', '1', '1'},
		{'0', '1', '0'},
		{'0', '0', '1'},
	}
	fmt.Println(numIslands(grid2))
	// Output: 2
}`,
      },
      {
        id: "clone-graph",
        title: "Clone Graph",
        difficulty: "Medium",
        leetcode: 133,
        description:
          "Given a reference to a node in a connected undirected graph, return a deep copy of the graph. Each node has a value and a list of neighbours.",
        examples: [
          { input: "adjList = [[2,4],[1,3],[2,4],[1,3]]", output: "[[2,4],[1,3],[2,4],[1,3]]", explanation: "Deep copy with same structure, all new node objects" },
          { input: "adjList = [[]]",                      output: "[[]]",                      explanation: "Single node with no neighbours" },
        ],
        approach:
          "DFS with a hash map (original node → clone). Before recursing into neighbours, create the clone and store it in the map. This prevents infinite loops on cycles and ensures each node is cloned exactly once.",
        complexity: { time: "O(V+E)", space: "O(V)" },
        code: `package main

import "fmt"

type Node struct {
	Val       int
	Neighbors []*Node
}

func cloneGraph(node *Node) *Node {
	if node == nil {
		return nil
	}
	visited := make(map[*Node]*Node)
	var dfs func(*Node) *Node
	dfs = func(n *Node) *Node {
		if clone, ok := visited[n]; ok {
			return clone
		}
		clone := &Node{Val: n.Val}
		visited[n] = clone
		for _, nb := range n.Neighbors {
			clone.Neighbors = append(clone.Neighbors, dfs(nb))
		}
		return clone
	}
	return dfs(node)
}

func main() {
	// Build: 1--2
	//        |  |
	//        4--3
	n1 := &Node{Val: 1}
	n2 := &Node{Val: 2}
	n3 := &Node{Val: 3}
	n4 := &Node{Val: 4}
	n1.Neighbors = []*Node{n2, n4}
	n2.Neighbors = []*Node{n1, n3}
	n3.Neighbors = []*Node{n2, n4}
	n4.Neighbors = []*Node{n1, n3}

	clone := cloneGraph(n1)
	fmt.Println(clone.Val, len(clone.Neighbors))
	// Output: 1 2  (node 1 with 2 neighbours)
	fmt.Println(clone != n1) // different object
	// Output: true
}`,
      },
      {
        id: "course-schedule",
        title: "Course Schedule",
        difficulty: "Medium",
        leetcode: 207,
        description:
          "There are numCourses courses (0 to n-1). Given prerequisites pairs [a,b] meaning 'take b before a', return true if you can finish all courses (i.e. no cycle exists in the dependency graph).",
        examples: [
          { input: "numCourses=2, prerequisites=[[1,0]]",       output: "true",  explanation: "Take course 0 first, then 1" },
          { input: "numCourses=2, prerequisites=[[1,0],[0,1]]", output: "false", explanation: "Circular dependency — cycle detected" },
        ],
        approach:
          "Build a directed adjacency list. Run DFS with three states per node: 0=unvisited, 1=visiting (in current path), 2=done. If DFS reaches a node in state 1, a cycle exists. Mark nodes as done (2) after all neighbours are processed.",
        complexity: { time: "O(V+E)", space: "O(V+E)" },
        code: `package main

import "fmt"

func canFinish(numCourses int, prerequisites [][]int) bool {
	graph := make([][]int, numCourses)
	for _, p := range prerequisites {
		graph[p[1]] = append(graph[p[1]], p[0])
	}
	// 0=unvisited 1=visiting 2=done
	state := make([]int, numCourses)
	var dfs func(int) bool
	dfs = func(node int) bool {
		if state[node] == 1 { return false } // cycle
		if state[node] == 2 { return true }  // already processed
		state[node] = 1
		for _, nb := range graph[node] {
			if !dfs(nb) { return false }
		}
		state[node] = 2
		return true
	}
	for i := 0; i < numCourses; i++ {
		if !dfs(i) { return false }
	}
	return true
}

func main() {
	fmt.Println(canFinish(2, [][]int{{1, 0}}))
	// Output: true

	fmt.Println(canFinish(2, [][]int{{1, 0}, {0, 1}}))
	// Output: false

	fmt.Println(canFinish(4, [][]int{{1, 0}, {2, 1}, {3, 2}}))
	// Output: true
}`,
      },
      {
        id: "pacific-atlantic-water-flow",
        title: "Pacific Atlantic Water Flow",
        difficulty: "Medium",
        leetcode: 417,
        description:
          "Given an m×n island where the top/left borders touch the Pacific Ocean and bottom/right borders touch the Atlantic, return all cells from which water can flow to both oceans (water flows to equal or lower adjacent cells).",
        examples: [
          { input: "heights = [[1,2,2,3,5],[3,2,3,4,4],[2,4,5,3,1],[6,7,1,4,5],[5,1,1,2,4]]", output: "[[0,4],[1,3],[1,4],[2,2],[3,0],[3,1],[4,0]]", explanation: "7 cells can reach both oceans" },
        ],
        approach:
          "Reverse the problem: BFS/DFS from all Pacific-border cells (flow uphill from ocean) and separately from all Atlantic-border cells. A cell that appears in both reachable sets flows to both oceans.",
        complexity: { time: "O(m×n)", space: "O(m×n)" },
        code: `package main

import "fmt"

func pacificAtlantic(heights [][]int) [][]int {
	m, n := len(heights), len(heights[0])
	dirs := [][2]int{{1,0},{-1,0},{0,1},{0,-1}}

	bfs := func(starts [][2]int) [][]bool {
		visited := make([][]bool, m)
		for i := range visited { visited[i] = make([]bool, n) }
		queue := starts
		for _, s := range starts { visited[s[0]][s[1]] = true }
		for len(queue) > 0 {
			cell := queue[0]; queue = queue[1:]
			for _, d := range dirs {
				r, c := cell[0]+d[0], cell[1]+d[1]
				if r >= 0 && r < m && c >= 0 && c < n &&
					!visited[r][c] && heights[r][c] >= heights[cell[0]][cell[1]] {
					visited[r][c] = true
					queue = append(queue, [2]int{r, c})
				}
			}
		}
		return visited
	}

	pacStarts, atlStarts := [][2]int{}, [][2]int{}
	for r := 0; r < m; r++ {
		pacStarts  = append(pacStarts,  [2]int{r, 0})
		atlStarts  = append(atlStarts,  [2]int{r, n-1})
	}
	for c := 0; c < n; c++ {
		pacStarts  = append(pacStarts,  [2]int{0, c})
		atlStarts  = append(atlStarts,  [2]int{m-1, c})
	}

	pac := bfs(pacStarts)
	atl := bfs(atlStarts)

	result := [][]int{}
	for r := 0; r < m; r++ {
		for c := 0; c < n; c++ {
			if pac[r][c] && atl[r][c] {
				result = append(result, []int{r, c})
			}
		}
	}
	return result
}

func main() {
	h := [][]int{{1,2,2,3,5},{3,2,3,4,4},{2,4,5,3,1},{6,7,1,4,5},{5,1,1,2,4}}
	fmt.Println(pacificAtlantic(h))
	// Output: [[0 4] [1 3] [1 4] [2 2] [3 0] [3 1] [4 0]]
}`,
      },
      {
        id: "rotting-oranges",
        title: "Rotting Oranges",
        difficulty: "Medium",
        leetcode: 994,
        description:
          "In a grid, 0=empty, 1=fresh orange, 2=rotten orange. Each minute all fresh oranges adjacent to rotten ones become rotten. Return the minimum minutes until no fresh orange remains, or -1 if impossible.",
        examples: [
          { input: "grid = [[2,1,1],[1,1,0],[0,1,1]]", output: "4", explanation: "All fresh oranges rot after 4 minutes" },
          { input: "grid = [[2,1,1],[0,1,1],[1,0,1]]", output: "-1", explanation: "Bottom-left fresh orange is unreachable" },
        ],
        approach:
          "Multi-source BFS starting from all rotten oranges simultaneously. Each BFS level = one minute. Count fresh oranges before BFS; decrement as they rot. If any fresh remain after BFS, return -1.",
        complexity: { time: "O(m×n)", space: "O(m×n)" },
        code: `package main

import "fmt"

func orangesRotting(grid [][]int) int {
	m, n := len(grid), len(grid[0])
	queue := [][2]int{}
	fresh := 0
	for r := 0; r < m; r++ {
		for c := 0; c < n; c++ {
			if grid[r][c] == 2 { queue = append(queue, [2]int{r, c}) }
			if grid[r][c] == 1 { fresh++ }
		}
	}
	dirs := [][2]int{{1,0},{-1,0},{0,1},{0,-1}}
	minutes := 0
	for len(queue) > 0 && fresh > 0 {
		minutes++
		size := len(queue)
		for i := 0; i < size; i++ {
			cell := queue[0]; queue = queue[1:]
			for _, d := range dirs {
				r, c := cell[0]+d[0], cell[1]+d[1]
				if r >= 0 && r < m && c >= 0 && c < n && grid[r][c] == 1 {
					grid[r][c] = 2
					fresh--
					queue = append(queue, [2]int{r, c})
				}
			}
		}
	}
	if fresh > 0 { return -1 }
	return minutes
}

func main() {
	fmt.Println(orangesRotting([][]int{{2,1,1},{1,1,0},{0,1,1}}))
	// Output: 4

	fmt.Println(orangesRotting([][]int{{2,1,1},{0,1,1},{1,0,1}}))
	// Output: -1

	fmt.Println(orangesRotting([][]int{{0,2}}))
	// Output: 0
}`,
      },
      {
        id: "number-of-connected-components",
        title: "Number of Connected Components",
        difficulty: "Medium",
        leetcode: 323,
        description:
          "Given n nodes (0 to n-1) and a list of undirected edges, return the number of connected components in the graph.",
        examples: [
          { input: "n=5, edges=[[0,1],[1,2],[3,4]]",          output: "2", explanation: "Components: {0,1,2} and {3,4}" },
          { input: "n=5, edges=[[0,1],[1,2],[2,3],[3,4]]",    output: "1", explanation: "All nodes connected" },
        ],
        approach:
          "Union-Find (Disjoint Set Union). Initialise each node as its own parent. For each edge, union the two nodes. Count the number of nodes that are still their own root — each root represents one component.",
        complexity: { time: "O(n·α(n)) ≈ O(n)", space: "O(n)" },
        code: `package main

import "fmt"

func countComponents(n int, edges [][]int) int {
	parent := make([]int, n)
	rank   := make([]int, n)
	for i := range parent { parent[i] = i }

	var find func(int) int
	find = func(x int) int {
		if parent[x] != x { parent[x] = find(parent[x]) }
		return parent[x]
	}

	union := func(a, b int) bool {
		pa, pb := find(a), find(b)
		if pa == pb { return false }
		if rank[pa] < rank[pb] { pa, pb = pb, pa }
		parent[pb] = pa
		if rank[pa] == rank[pb] { rank[pa]++ }
		return true
	}

	components := n
	for _, e := range edges {
		if union(e[0], e[1]) { components-- }
	}
	return components
}

func main() {
	fmt.Println(countComponents(5, [][]int{{0,1},{1,2},{3,4}}))
	// Output: 2

	fmt.Println(countComponents(5, [][]int{{0,1},{1,2},{2,3},{3,4}}))
	// Output: 1
}`,
      },
      {
        id: "surrounded-regions",
        title: "Surrounded Regions",
        difficulty: "Medium",
        leetcode: 130,
        description:
          "Given an m×n board of 'X' and 'O', capture all 'O' regions surrounded by 'X' — flip them to 'X'. 'O's on or connected to the border are never flipped.",
        examples: [
          { input: '[["X","X","X","X"],["X","O","O","X"],["X","X","O","X"],["X","O","X","X"]]', output: '[["X","X","X","X"],["X","X","X","X"],["X","X","X","X"],["X","O","X","X"]]', explanation: "Interior O's flipped; border-connected O stays" },
        ],
        approach:
          "Mark all 'O's connected to the border as safe (use DFS/BFS to mark them as 'S'). Then scan the whole board: 'O' → 'X' (captured), 'S' → 'O' (restore safe). This avoids tracing which O's are surrounded.",
        complexity: { time: "O(m×n)", space: "O(m×n)" },
        code: `package main

import "fmt"

func solve(board [][]byte) {
	m, n := len(board), len(board[0])

	var dfs func(r, c int)
	dfs = func(r, c int) {
		if r < 0 || r >= m || c < 0 || c >= n || board[r][c] != 'O' { return }
		board[r][c] = 'S' // safe
		dfs(r+1, c); dfs(r-1, c); dfs(r, c+1); dfs(r, c-1)
	}

	// Mark border-connected O's as safe
	for r := 0; r < m; r++ { dfs(r, 0); dfs(r, n-1) }
	for c := 0; c < n; c++ { dfs(0, c); dfs(m-1, c) }

	// Flip: O→X (captured), S→O (restore)
	for r := 0; r < m; r++ {
		for c := 0; c < n; c++ {
			if board[r][c] == 'O' { board[r][c] = 'X' }
			if board[r][c] == 'S' { board[r][c] = 'O' }
		}
	}
}

func main() {
	board := [][]byte{
		{'X','X','X','X'},
		{'X','O','O','X'},
		{'X','X','O','X'},
		{'X','O','X','X'},
	}
	solve(board)
	for _, row := range board { fmt.Println(string(row)) }
	// Output:
	// XXXX
	// XXXX
	// XXXX
	// XOXX
}`,
      },
      {
        id: "graph-valid-tree",
        title: "Graph Valid Tree",
        difficulty: "Medium",
        leetcode: 261,
        description:
          "Given n nodes and a list of undirected edges, return true if the edges form a valid tree — connected with no cycles.",
        examples: [
          { input: "n=5, edges=[[0,1],[0,2],[0,3],[1,4]]", output: "true",  explanation: "Connected, no cycle, exactly n-1 edges" },
          { input: "n=5, edges=[[0,1],[1,2],[2,3],[1,3],[1,4]]", output: "false", explanation: "Cycle: 1→2→3→1" },
        ],
        approach:
          "A valid tree has exactly n-1 edges and is connected. Use Union-Find: if unioning an edge finds both nodes already in the same component, a cycle exists. After all edges, verify the component count is 1.",
        complexity: { time: "O(n·α(n))", space: "O(n)" },
        code: `package main

import "fmt"

func validTree(n int, edges [][]int) bool {
	if len(edges) != n-1 { return false }
	parent := make([]int, n)
	for i := range parent { parent[i] = i }

	var find func(int) int
	find = func(x int) int {
		if parent[x] != x { parent[x] = find(parent[x]) }
		return parent[x]
	}

	for _, e := range edges {
		pa, pb := find(e[0]), find(e[1])
		if pa == pb { return false } // cycle
		parent[pa] = pb
	}
	return true
}

func main() {
	fmt.Println(validTree(5, [][]int{{0,1},{0,2},{0,3},{1,4}}))
	// Output: true

	fmt.Println(validTree(5, [][]int{{0,1},{1,2},{2,3},{1,3},{1,4}}))
	// Output: false
}`,
      },
      {
        id: "word-ladder",
        title: "Word Ladder",
        difficulty: "Hard",
        leetcode: 127,
        description:
          "Given beginWord, endWord, and a wordList, return the length of the shortest transformation sequence from beginWord to endWord where each step changes exactly one letter and every intermediate word must be in wordList.",
        examples: [
          { input: 'beginWord="hit", endWord="cog", wordList=["hot","dot","dog","lot","log","cog"]', output: "5", explanation: "hit→hot→dot→dog→cog (5 words)" },
          { input: 'beginWord="hit", endWord="cog", wordList=["hot","dot","dog","lot","log"]',       output: "0", explanation: "endWord not in wordList" },
        ],
        approach:
          "BFS from beginWord. At each level try changing every character (a-z) of the current word. If the new word is in the wordSet, add it to the queue and remove it from the set (visited). Return the level count when endWord is reached.",
        complexity: { time: "O(m²×n) where m=word length, n=list size", space: "O(m×n)" },
        code: `package main

import "fmt"

func ladderLength(beginWord string, endWord string, wordList []string) int {
	wordSet := make(map[string]bool)
	for _, w := range wordList { wordSet[w] = true }
	if !wordSet[endWord] { return 0 }

	queue := []string{beginWord}
	steps := 1

	for len(queue) > 0 {
		size := len(queue)
		for i := 0; i < size; i++ {
			word := queue[0]; queue = queue[1:]
			if word == endWord { return steps }
			b := []byte(word)
			for j := 0; j < len(b); j++ {
				orig := b[j]
				for c := byte('a'); c <= 'z'; c++ {
					if c == orig { continue }
					b[j] = c
					next := string(b)
					if wordSet[next] {
						queue = append(queue, next)
						delete(wordSet, next)
					}
				}
				b[j] = orig
			}
		}
		steps++
	}
	return 0
}

func main() {
	fmt.Println(ladderLength("hit", "cog", []string{"hot","dot","dog","lot","log","cog"}))
	// Output: 5

	fmt.Println(ladderLength("hit", "cog", []string{"hot","dot","dog","lot","log"}))
	// Output: 0
}`,
      },
      {
        id: "course-schedule-ii",
        title: "Course Schedule II",
        difficulty: "Medium",
        leetcode: 210,
        description:
          "Given numCourses and prerequisites, return any valid order to finish all courses (topological sort). If impossible, return an empty array.",
        examples: [
          { input: "numCourses=4, prerequisites=[[1,0],[2,0],[3,1],[3,2]]", output: "[0,1,2,3] or [0,2,1,3]", explanation: "Valid topological orderings" },
          { input: "numCourses=2, prerequisites=[[1,0],[0,1]]",            output: "[]",                       explanation: "Cycle — impossible" },
        ],
        approach:
          "DFS-based topological sort with three states (0=unvisited, 1=visiting, 2=done). Process each unvisited node: mark visiting, recurse on all neighbours, mark done, append to result. Reverse at the end. Return empty if a cycle is found.",
        complexity: { time: "O(V+E)", space: "O(V+E)" },
        code: `package main

import "fmt"

func findOrder(numCourses int, prerequisites [][]int) []int {
	graph := make([][]int, numCourses)
	for _, p := range prerequisites {
		graph[p[1]] = append(graph[p[1]], p[0])
	}
	state := make([]int, numCourses) // 0=unvisited 1=visiting 2=done
	order := []int{}
	cycle := false

	var dfs func(int)
	dfs = func(node int) {
		if cycle || state[node] == 1 { cycle = true; return }
		if state[node] == 2 { return }
		state[node] = 1
		for _, nb := range graph[node] { dfs(nb) }
		state[node] = 2
		order = append(order, node)
	}

	for i := 0; i < numCourses; i++ { dfs(i) }
	if cycle { return []int{} }

	// reverse
	for l, r := 0, len(order)-1; l < r; l, r = l+1, r-1 {
		order[l], order[r] = order[r], order[l]
	}
	return order
}

func main() {
	fmt.Println(findOrder(4, [][]int{{1,0},{2,0},{3,1},{3,2}}))
	// Output: [0 2 1 3] or [0 1 2 3]

	fmt.Println(findOrder(2, [][]int{{1,0},{0,1}}))
	// Output: []
}`,
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // 10. Backtracking
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "backtracking",
    icon: "↩️",
    title: "Backtracking",
    problems: [
      {
        id: "subsets",
        title: "Subsets",
        difficulty: "Medium",
        leetcode: 78,
        description:
          "Given an integer array nums of unique elements, return all possible subsets (the power set). The solution set must not contain duplicate subsets.",
        examples: [
          { input: "nums = [1,2,3]", output: "[[],[1],[1,2],[1,2,3],[1,3],[2],[2,3],[3]]", explanation: "All 2³ = 8 subsets" },
          { input: "nums = [0]",     output: "[[],[0]]",                                    explanation: "Empty set and {0}" },
        ],
        approach:
          "DFS with a start index. At each call append the current path to results (every node in the decision tree is a valid subset). Loop from start to end: include nums[i], recurse with i+1, then remove nums[i] (backtrack).",
        complexity: { time: "O(2ⁿ)", space: "O(n)" },
        code: `package main

import "fmt"

func subsets(nums []int) [][]int {
	result := [][]int{}
	var dfs func(start int, path []int)
	dfs = func(start int, path []int) {
		tmp := make([]int, len(path))
		copy(tmp, path)
		result = append(result, tmp)
		for i := start; i < len(nums); i++ {
			path = append(path, nums[i])
			dfs(i+1, path)
			path = path[:len(path)-1] // backtrack
		}
	}
	dfs(0, []int{})
	return result
}

func main() {
	fmt.Println(subsets([]int{1, 2, 3}))
	// Output: [[] [1] [1 2] [1 2 3] [1 3] [2] [2 3] [3]]

	fmt.Println(subsets([]int{0}))
	// Output: [[] [0]]
}`,
      },
      {
        id: "combination-sum",
        title: "Combination Sum",
        difficulty: "Medium",
        leetcode: 39,
        description:
          "Given an array of distinct integers candidates and a target, return all unique combinations where the chosen numbers sum to target. The same number may be used unlimited times.",
        examples: [
          { input: "candidates = [2,3,6,7], target = 7", output: "[[2,2,3],[7]]",      explanation: "Two ways to reach 7" },
          { input: "candidates = [2,3,5], target = 8",   output: "[[2,2,2,2],[2,3,3],[3,5]]", explanation: "Three combinations" },
        ],
        approach:
          "DFS with a start index and remaining target. At each step try including candidates[i] (can reuse — don't increment start). If remaining == 0, record the path. If remaining < 0 or i >= len, backtrack. Sorting candidates enables early pruning.",
        complexity: { time: "O(2^(t/m)) where t=target, m=min candidate", space: "O(t/m)" },
        code: `package main

import "fmt"

func combinationSum(candidates []int, target int) [][]int {
	result := [][]int{}
	var dfs func(start, remaining int, path []int)
	dfs = func(start, remaining int, path []int) {
		if remaining == 0 {
			tmp := make([]int, len(path))
			copy(tmp, path)
			result = append(result, tmp)
			return
		}
		for i := start; i < len(candidates); i++ {
			if candidates[i] > remaining { continue }
			path = append(path, candidates[i])
			dfs(i, remaining-candidates[i], path) // i, not i+1 (reuse allowed)
			path = path[:len(path)-1]
		}
	}
	dfs(0, target, []int{})
	return result
}

func main() {
	fmt.Println(combinationSum([]int{2, 3, 6, 7}, 7))
	// Output: [[2 2 3] [7]]

	fmt.Println(combinationSum([]int{2, 3, 5}, 8))
	// Output: [[2 2 2 2] [2 3 3] [3 5]]
}`,
      },
      {
        id: "permutations",
        title: "Permutations",
        difficulty: "Medium",
        leetcode: 46,
        description:
          "Given an array nums of distinct integers, return all possible permutations in any order.",
        examples: [
          { input: "nums = [1,2,3]", output: "[[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]", explanation: "All 3! = 6 permutations" },
          { input: "nums = [0,1]",   output: "[[0,1],[1,0]]",                                       explanation: "2! = 2 permutations" },
        ],
        approach:
          "Swap-based backtracking: fix each element at the current position by swapping it with every subsequent element, recurse to fill the next position, then swap back to restore order. No extra visited array needed.",
        complexity: { time: "O(n!)", space: "O(n)" },
        code: `package main

import "fmt"

func permute(nums []int) [][]int {
	result := [][]int{}
	var dfs func(start int)
	dfs = func(start int) {
		if start == len(nums) {
			tmp := make([]int, len(nums))
			copy(tmp, nums)
			result = append(result, tmp)
			return
		}
		for i := start; i < len(nums); i++ {
			nums[start], nums[i] = nums[i], nums[start]
			dfs(start + 1)
			nums[start], nums[i] = nums[i], nums[start] // backtrack
		}
	}
	dfs(0)
	return result
}

func main() {
	fmt.Println(permute([]int{1, 2, 3}))
	// Output: [[1 2 3] [1 3 2] [2 1 3] [2 3 1] [3 2 1] [3 1 2]]

	fmt.Println(permute([]int{0, 1}))
	// Output: [[0 1] [1 0]]
}`,
      },
      {
        id: "letter-combinations-phone",
        title: "Letter Combinations of a Phone Number",
        difficulty: "Medium",
        leetcode: 17,
        description:
          "Given a string of digits (2-9), return all possible letter combinations the number could represent (like a phone keypad). Return an empty list for empty input.",
        examples: [
          { input: 'digits = "23"', output: '["ad","ae","af","bd","be","bf","cd","ce","cf"]', explanation: "2=abc, 3=def — all 9 combinations" },
          { input: 'digits = "2"',  output: '["a","b","c"]',                                  explanation: "Single digit" },
        ],
        approach:
          "DFS with an index into digits. At each level try every letter mapped to digits[index], append it to the current path, recurse for index+1, then backtrack. When index reaches len(digits), record the path.",
        complexity: { time: "O(4ⁿ × n)", space: "O(n)" },
        code: `package main

import "fmt"

func letterCombinations(digits string) []string {
	if len(digits) == 0 { return nil }
	phone := map[byte]string{
		'2': "abc", '3': "def", '4': "ghi", '5': "jkl",
		'6': "mno", '7': "pqrs", '8': "tuv", '9': "wxyz",
	}
	result := []string{}
	var dfs func(idx int, path []byte)
	dfs = func(idx int, path []byte) {
		if idx == len(digits) {
			result = append(result, string(path))
			return
		}
		for _, c := range phone[digits[idx]] {
			path = append(path, byte(c))
			dfs(idx+1, path)
			path = path[:len(path)-1]
		}
	}
	dfs(0, []byte{})
	return result
}

func main() {
	fmt.Println(letterCombinations("23"))
	// Output: [ad ae af bd be bf cd ce cf]

	fmt.Println(letterCombinations("2"))
	// Output: [a b c]
}`,
      },
      {
        id: "n-queens",
        title: "N-Queens",
        difficulty: "Hard",
        leetcode: 51,
        description:
          "Place n queens on an n×n chessboard so no two queens attack each other. Return all distinct solutions, each as a list of strings where 'Q' is a queen and '.' is empty.",
        examples: [
          { input: "n = 4", output: '[["..Q.","Q...","...Q",".Q.."],["Q...","...Q",".Q..","..Q."]]', explanation: "Two solutions for 4-queens" },
          { input: "n = 1", output: '[["Q"]]',                                                        explanation: "Trivial single solution" },
        ],
        approach:
          "Place queens one row at a time. Track occupied columns and both diagonals (col, row-col, row+col) in sets. For each row try every column — skip if any set contains that position. Backtrack by removing from sets after recursion.",
        complexity: { time: "O(n!)", space: "O(n)" },
        code: `package main

import (
	"fmt"
	"strings"
)

func solveNQueens(n int) [][]string {
	result := [][]string{}
	cols := make(map[int]bool)
	diag1 := make(map[int]bool) // row - col
	diag2 := make(map[int]bool) // row + col
	board := make([][]byte, n)
	for i := range board {
		board[i] = []byte(strings.Repeat(".", n))
	}

	var dfs func(row int)
	dfs = func(row int) {
		if row == n {
			snapshot := make([]string, n)
			for i, r := range board { snapshot[i] = string(r) }
			result = append(result, snapshot)
			return
		}
		for col := 0; col < n; col++ {
			if cols[col] || diag1[row-col] || diag2[row+col] { continue }
			board[row][col] = 'Q'
			cols[col], diag1[row-col], diag2[row+col] = true, true, true
			dfs(row + 1)
			board[row][col] = '.'
			delete(cols, col); delete(diag1, row-col); delete(diag2, row+col)
		}
	}
	dfs(0)
	return result
}

func main() {
	solutions := solveNQueens(4)
	fmt.Println(len(solutions), "solutions")
	for _, s := range solutions { fmt.Println(s) }
	// Output:
	// 2 solutions
	// [..Q. Q... ...Q .Q..]
	// [.Q.. ...Q Q... ..Q.]
}`,
      },
      {
        id: "word-search",
        title: "Word Search",
        difficulty: "Medium",
        leetcode: 79,
        description:
          "Given an m×n character grid and a string word, return true if the word exists in the grid as a sequence of adjacent (horizontally/vertically) cells, each used at most once.",
        examples: [
          { input: 'board=[["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], word="ABCCED"', output: "true",  explanation: "Path A→B→C→C→E→D exists" },
          { input: 'word="ABCB"',                                                                   output: "false", explanation: "Cannot reuse cell B" },
        ],
        approach:
          "DFS from every cell that matches word[0]. At each step mark the cell as visited (temporarily change to '#'), recurse on 4 neighbours for the next character, then restore the cell (backtrack). Return true as soon as all characters are matched.",
        complexity: { time: "O(m×n×4^L) where L=word length", space: "O(L)" },
        code: `package main

import "fmt"

func exist(board [][]byte, word string) bool {
	m, n := len(board), len(board[0])

	var dfs func(r, c, idx int) bool
	dfs = func(r, c, idx int) bool {
		if idx == len(word) { return true }
		if r < 0 || r >= m || c < 0 || c >= n || board[r][c] != word[idx] {
			return false
		}
		tmp := board[r][c]
		board[r][c] = '#' // mark visited
		found := dfs(r+1,c,idx+1) || dfs(r-1,c,idx+1) ||
		         dfs(r,c+1,idx+1) || dfs(r,c-1,idx+1)
		board[r][c] = tmp // backtrack
		return found
	}

	for r := 0; r < m; r++ {
		for c := 0; c < n; c++ {
			if dfs(r, c, 0) { return true }
		}
	}
	return false
}

func main() {
	board := [][]byte{
		{'A','B','C','E'},
		{'S','F','C','S'},
		{'A','D','E','E'},
	}
	fmt.Println(exist(board, "ABCCED"))
	// Output: true

	fmt.Println(exist(board, "SEE"))
	// Output: true

	fmt.Println(exist(board, "ABCB"))
	// Output: false
}`,
      },
      {
        id: "palindrome-partitioning",
        title: "Palindrome Partitioning",
        difficulty: "Medium",
        leetcode: 131,
        description:
          "Given a string s, partition it such that every substring in the partition is a palindrome. Return all possible palindrome partitionings.",
        examples: [
          { input: 's = "aab"', output: '[["a","a","b"],["aa","b"]]', explanation: "Two valid palindrome partitions" },
          { input: 's = "a"',   output: '[["a"]]',                    explanation: "Single character is always a palindrome" },
        ],
        approach:
          "DFS with a start index. Try every substring s[start:end+1] — if it's a palindrome, add it to the current path and recurse from end+1. When start reaches len(s), record the partition. Backtrack after each recursive call.",
        complexity: { time: "O(n × 2ⁿ)", space: "O(n)" },
        code: `package main

import "fmt"

func partition(s string) [][]string {
	result := [][]string{}

	isPalin := func(sub string) bool {
		for l, r := 0, len(sub)-1; l < r; l, r = l+1, r-1 {
			if sub[l] != sub[r] { return false }
		}
		return true
	}

	var dfs func(start int, path []string)
	dfs = func(start int, path []string) {
		if start == len(s) {
			tmp := make([]string, len(path))
			copy(tmp, path)
			result = append(result, tmp)
			return
		}
		for end := start + 1; end <= len(s); end++ {
			sub := s[start:end]
			if isPalin(sub) {
				path = append(path, sub)
				dfs(end, path)
				path = path[:len(path)-1]
			}
		}
	}
	dfs(0, []string{})
	return result
}

func main() {
	fmt.Println(partition("aab"))
	// Output: [[a a b] [aa b]]

	fmt.Println(partition("a"))
	// Output: [[a]]
}`,
      },
      {
        id: "combination-sum-ii",
        title: "Combination Sum II",
        difficulty: "Medium",
        leetcode: 40,
        description:
          "Given a collection of candidate numbers (may have duplicates) and a target, find all unique combinations that sum to target. Each number may only be used once.",
        examples: [
          { input: "candidates = [10,1,2,7,6,1,5], target = 8", output: "[[1,1,6],[1,2,5],[1,7],[2,6]]", explanation: "4 unique combinations" },
          { input: "candidates = [2,5,2,1,2], target = 5",       output: "[[1,2,2],[5]]",                  explanation: "2 unique combinations" },
        ],
        approach:
          "Sort first. DFS with start index; after picking candidates[i], advance to i+1 (no reuse). To avoid duplicate combinations, skip candidates[i] when i > start and candidates[i] == candidates[i-1] — same value already explored at this level.",
        complexity: { time: "O(2ⁿ)", space: "O(n)" },
        code: `package main

import (
	"fmt"
	"sort"
)

func combinationSum2(candidates []int, target int) [][]int {
	sort.Ints(candidates)
	result := [][]int{}
	var dfs func(start, remaining int, path []int)
	dfs = func(start, remaining int, path []int) {
		if remaining == 0 {
			tmp := make([]int, len(path))
			copy(tmp, path)
			result = append(result, tmp)
			return
		}
		for i := start; i < len(candidates); i++ {
			if candidates[i] > remaining { break }
			if i > start && candidates[i] == candidates[i-1] { continue } // skip dup
			path = append(path, candidates[i])
			dfs(i+1, remaining-candidates[i], path)
			path = path[:len(path)-1]
		}
	}
	dfs(0, target, []int{})
	return result
}

func main() {
	fmt.Println(combinationSum2([]int{10, 1, 2, 7, 6, 1, 5}, 8))
	// Output: [[1 1 6] [1 2 5] [1 7] [2 6]]

	fmt.Println(combinationSum2([]int{2, 5, 2, 1, 2}, 5))
	// Output: [[1 2 2] [5]]
}`,
      },
      {
        id: "subsets-ii",
        title: "Subsets II",
        difficulty: "Medium",
        leetcode: 90,
        description:
          "Given an integer array nums that may contain duplicates, return all possible unique subsets. The solution set must not contain duplicate subsets.",
        examples: [
          { input: "nums = [1,2,2]", output: "[[],[1],[1,2],[1,2,2],[2],[2,2]]", explanation: "6 unique subsets" },
          { input: "nums = [0]",     output: "[[],[0]]",                          explanation: "2 subsets" },
        ],
        approach:
          "Sort first. Same DFS as Subsets, but skip nums[i] when i > start and nums[i] == nums[i-1] to avoid generating duplicate subsets at the same decision level.",
        complexity: { time: "O(2ⁿ)", space: "O(n)" },
        code: `package main

import (
	"fmt"
	"sort"
)

func subsetsWithDup(nums []int) [][]int {
	sort.Ints(nums)
	result := [][]int{}
	var dfs func(start int, path []int)
	dfs = func(start int, path []int) {
		tmp := make([]int, len(path))
		copy(tmp, path)
		result = append(result, tmp)
		for i := start; i < len(nums); i++ {
			if i > start && nums[i] == nums[i-1] { continue } // skip dup
			path = append(path, nums[i])
			dfs(i+1, path)
			path = path[:len(path)-1]
		}
	}
	dfs(0, []int{})
	return result
}

func main() {
	fmt.Println(subsetsWithDup([]int{1, 2, 2}))
	// Output: [[] [1] [1 2] [1 2 2] [2] [2 2]]

	fmt.Println(subsetsWithDup([]int{0}))
	// Output: [[] [0]]
}`,
      },
      {
        id: "generate-parentheses",
        title: "Generate Parentheses",
        difficulty: "Medium",
        leetcode: 22,
        description:
          "Given n pairs of parentheses, generate all combinations of well-formed parentheses.",
        examples: [
          { input: "n = 3", output: '["((()))","(()())","(())()","()(())","()()()"]', explanation: "All 5 valid combinations for n=3" },
          { input: "n = 1", output: '["()"]',                                          explanation: "Only one valid combination" },
        ],
        approach:
          "DFS tracking open and close counts. Add '(' if open < n. Add ')' if close < open. When the path length equals 2n, record it. This naturally generates only valid sequences without any post-filtering.",
        complexity: { time: "O(4ⁿ/√n) — Catalan number", space: "O(n)" },
        code: `package main

import "fmt"

func generateParenthesis(n int) []string {
	result := []string{}
	var dfs func(open, close int, path []byte)
	dfs = func(open, close int, path []byte) {
		if len(path) == 2*n {
			result = append(result, string(path))
			return
		}
		if open < n {
			dfs(open+1, close, append(path, '('))
		}
		if close < open {
			dfs(open, close+1, append(path, ')'))
		}
	}
	dfs(0, 0, []byte{})
	return result
}

func main() {
	fmt.Println(generateParenthesis(3))
	// Output: [((()))  (()()) (())() ()(()) ()()()]

	fmt.Println(generateParenthesis(1))
	// Output: [()]
}`,
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // 11. Dynamic Programming
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "dynamic-programming",
    icon: "📐",
    title: "Dynamic Programming",
    problems: [
      {
        id: "climbing-stairs",
        title: "Climbing Stairs",
        difficulty: "Easy",
        leetcode: 70,
        description:
          "You are climbing a staircase with n steps. Each time you can climb 1 or 2 steps. In how many distinct ways can you reach the top?",
        examples: [
          { input: "n = 2", output: "2",  explanation: "1+1 or 2" },
          { input: "n = 3", output: "3",  explanation: "1+1+1, 1+2, or 2+1" },
        ],
        approach:
          "ways(n) = ways(n-1) + ways(n-2) — identical to Fibonacci. Use two variables instead of an array: at each step shift prev2=prev1, prev1=prev1+prev2. Base cases: ways(1)=1, ways(2)=2.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func climbStairs(n int) int {
	if n <= 2 {
		return n
	}
	prev2, prev1 := 1, 2
	for i := 3; i <= n; i++ {
		prev2, prev1 = prev1, prev1+prev2
	}
	return prev1
}

func main() {
	fmt.Println(climbStairs(2))
	// Output: 2

	fmt.Println(climbStairs(3))
	// Output: 3

	fmt.Println(climbStairs(10))
	// Output: 89
}`,
      },
      {
        id: "house-robber",
        title: "House Robber",
        difficulty: "Medium",
        leetcode: 198,
        description:
          "Given an array of non-negative integers representing the amount of money at each house, return the maximum amount you can rob without robbing two adjacent houses.",
        examples: [
          { input: "nums = [1,2,3,1]",   output: "4",  explanation: "Rob house 1 (1) + house 3 (3) = 4" },
          { input: "nums = [2,7,9,3,1]", output: "12", explanation: "Rob house 1 (2) + house 3 (9) + house 5 (1) = 12" },
        ],
        approach:
          "dp[i] = max(dp[i-1], dp[i-2] + nums[i]). Either skip the current house (take dp[i-1]) or rob it and add to the best two houses ago. Track only two variables — no array needed.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func rob(nums []int) int {
	prev2, prev1 := 0, 0
	for _, n := range nums {
		prev2, prev1 = prev1, max(prev1, prev2+n)
	}
	return prev1
}

func max(a, b int) int {
	if a > b { return a }
	return b
}

func main() {
	fmt.Println(rob([]int{1, 2, 3, 1}))
	// Output: 4

	fmt.Println(rob([]int{2, 7, 9, 3, 1}))
	// Output: 12

	fmt.Println(rob([]int{2, 1, 1, 2}))
	// Output: 4
}`,
      },
      {
        id: "longest-common-subsequence",
        title: "Longest Common Subsequence",
        difficulty: "Medium",
        leetcode: 1143,
        description:
          "Given two strings text1 and text2, return the length of their longest common subsequence. A subsequence is derived by deleting some (or no) characters without changing relative order.",
        examples: [
          { input: 'text1 = "abcde", text2 = "ace"', output: "3", explanation: '"ace" is the LCS' },
          { input: 'text1 = "abc", text2 = "abc"',   output: "3", explanation: "Entire string is the LCS" },
          { input: 'text1 = "abc", text2 = "def"',   output: "0", explanation: "No common characters" },
        ],
        approach:
          "2D DP table where dp[i][j] = LCS length for text1[:i] and text2[:j]. If characters match: dp[i][j] = dp[i-1][j-1] + 1. Otherwise: dp[i][j] = max(dp[i-1][j], dp[i][j-1]). Can optimise to two rows.",
        complexity: { time: "O(m×n)", space: "O(m×n)" },
        code: `package main

import "fmt"

func longestCommonSubsequence(text1 string, text2 string) int {
	m, n := len(text1), len(text2)
	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}
	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if text1[i-1] == text2[j-1] {
				dp[i][j] = dp[i-1][j-1] + 1
			} else {
				dp[i][j] = dp[i-1][j]
				if dp[i][j-1] > dp[i][j] {
					dp[i][j] = dp[i][j-1]
				}
			}
		}
	}
	return dp[m][n]
}

func main() {
	fmt.Println(longestCommonSubsequence("abcde", "ace"))
	// Output: 3

	fmt.Println(longestCommonSubsequence("abc", "abc"))
	// Output: 3

	fmt.Println(longestCommonSubsequence("abc", "def"))
	// Output: 0
}`,
      },
      {
        id: "coin-change",
        title: "Coin Change",
        difficulty: "Medium",
        leetcode: 322,
        description:
          "Given an array of coin denominations and an amount, return the fewest number of coins needed to make up that amount. Return -1 if it is not possible.",
        examples: [
          { input: "coins = [1,5,10], amount = 11", output: "2",  explanation: "10 + 1 = 11" },
          { input: "coins = [2], amount = 3",        output: "-1", explanation: "Cannot make 3 with only 2s" },
        ],
        approach:
          "Bottom-up DP: dp[i] = minimum coins to make amount i. Initialise dp[0]=0, rest=∞. For each amount from 1 to amount, try every coin: dp[i] = min(dp[i], dp[i-coin]+1) if i >= coin. Answer is dp[amount] or -1 if still ∞.",
        complexity: { time: "O(amount × coins)", space: "O(amount)" },
        code: `package main

import "fmt"

func coinChange(coins []int, amount int) int {
	const inf = 1<<31 - 1
	dp := make([]int, amount+1)
	for i := 1; i <= amount; i++ {
		dp[i] = inf
	}
	for i := 1; i <= amount; i++ {
		for _, c := range coins {
			if i >= c && dp[i-c] != inf {
				if dp[i-c]+1 < dp[i] {
					dp[i] = dp[i-c] + 1
				}
			}
		}
	}
	if dp[amount] == inf {
		return -1
	}
	return dp[amount]
}

func main() {
	fmt.Println(coinChange([]int{1, 5, 10}, 11))
	// Output: 2

	fmt.Println(coinChange([]int{2}, 3))
	// Output: -1

	fmt.Println(coinChange([]int{1, 2, 5}, 11))
	// Output: 3
}`,
      },
      {
        id: "longest-increasing-subsequence",
        title: "Longest Increasing Subsequence",
        difficulty: "Medium",
        leetcode: 300,
        description:
          "Given an integer array nums, return the length of the longest strictly increasing subsequence.",
        examples: [
          { input: "nums = [10,9,2,5,3,7,101,18]", output: "4", explanation: "[2,3,7,101] or [2,5,7,101]" },
          { input: "nums = [0,1,0,3,2,3]",          output: "4", explanation: "[0,1,2,3]" },
        ],
        approach:
          "Patience sorting with binary search: maintain a tails array where tails[i] is the smallest tail of any increasing subsequence of length i+1. For each number, binary search for the first tail ≥ num and replace it (or append if larger than all). Length of tails is the answer.",
        complexity: { time: "O(n log n)", space: "O(n)" },
        code: `package main

import (
	"fmt"
	"sort"
)

func lengthOfLIS(nums []int) int {
	tails := []int{}
	for _, n := range nums {
		pos := sort.SearchInts(tails, n) // first index where tails[pos] >= n
		if pos == len(tails) {
			tails = append(tails, n)
		} else {
			tails[pos] = n
		}
	}
	return len(tails)
}

func main() {
	fmt.Println(lengthOfLIS([]int{10, 9, 2, 5, 3, 7, 101, 18}))
	// Output: 4

	fmt.Println(lengthOfLIS([]int{0, 1, 0, 3, 2, 3}))
	// Output: 4

	fmt.Println(lengthOfLIS([]int{7, 7, 7, 7}))
	// Output: 1
}`,
      },
      {
        id: "unique-paths",
        title: "Unique Paths",
        difficulty: "Medium",
        leetcode: 62,
        description:
          "A robot starts at the top-left of an m×n grid and wants to reach the bottom-right. It can only move right or down. How many unique paths are there?",
        examples: [
          { input: "m = 3, n = 7", output: "28",  explanation: "28 distinct paths from top-left to bottom-right" },
          { input: "m = 3, n = 2", output: "3",   explanation: "Right-Down-Down, Down-Right-Down, Down-Down-Right" },
        ],
        approach:
          "dp[i][j] = paths to reach cell (i,j) = dp[i-1][j] + dp[i][j-1]. First row and column are all 1 (only one way to reach them). Optimise to a single 1D array — update left to right, each cell accumulates paths from above.",
        complexity: { time: "O(m×n)", space: "O(n)" },
        code: `package main

import "fmt"

func uniquePaths(m int, n int) int {
	dp := make([]int, n)
	for i := range dp { dp[i] = 1 } // first row all 1s
	for i := 1; i < m; i++ {
		for j := 1; j < n; j++ {
			dp[j] += dp[j-1]
		}
	}
	return dp[n-1]
}

func main() {
	fmt.Println(uniquePaths(3, 7))
	// Output: 28

	fmt.Println(uniquePaths(3, 2))
	// Output: 3

	fmt.Println(uniquePaths(1, 1))
	// Output: 1
}`,
      },
      {
        id: "jump-game",
        title: "Jump Game",
        difficulty: "Medium",
        leetcode: 55,
        description:
          "Given an integer array nums where nums[i] is your maximum jump length at position i, return true if you can reach the last index starting from index 0.",
        examples: [
          { input: "nums = [2,3,1,1,4]", output: "true",  explanation: "Jump 1 to index 1, then 3 to last index" },
          { input: "nums = [3,2,1,0,4]", output: "false", explanation: "Always land on index 3 which has value 0" },
        ],
        approach:
          "Greedy: track maxReach — the furthest index reachable so far. For each index i, if i > maxReach we're stuck (return false). Otherwise update maxReach = max(maxReach, i + nums[i]). If maxReach >= last index, return true.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `package main

import "fmt"

func canJump(nums []int) bool {
	maxReach := 0
	for i, v := range nums {
		if i > maxReach {
			return false
		}
		if i+v > maxReach {
			maxReach = i + v
		}
	}
	return true
}

func main() {
	fmt.Println(canJump([]int{2, 3, 1, 1, 4}))
	// Output: true

	fmt.Println(canJump([]int{3, 2, 1, 0, 4}))
	// Output: false

	fmt.Println(canJump([]int{0}))
	// Output: true
}`,
      },
      {
        id: "word-break",
        title: "Word Break",
        difficulty: "Medium",
        leetcode: 139,
        description:
          "Given a string s and a dictionary of strings wordDict, return true if s can be segmented into a space-separated sequence of dictionary words.",
        examples: [
          { input: 's = "leetcode", wordDict = ["leet","code"]',        output: "true",  explanation: '"leetcode" = "leet" + "code"' },
          { input: 's = "applepenapple", wordDict = ["apple","pen"]',   output: "true",  explanation: '"apple" + "pen" + "apple"' },
          { input: 's = "catsandog", wordDict = ["cats","dog","sand"]', output: "false", explanation: "Cannot segment completely" },
        ],
        approach:
          "dp[i] = true if s[:i] can be segmented. dp[0] = true (empty string). For each position i, check all j < i: if dp[j] is true and s[j:i] is in the word set, set dp[i] = true. Answer is dp[len(s)].",
        complexity: { time: "O(n²)", space: "O(n)" },
        code: `package main

import "fmt"

func wordBreak(s string, wordDict []string) bool {
	wordSet := make(map[string]bool)
	for _, w := range wordDict {
		wordSet[w] = true
	}
	n := len(s)
	dp := make([]bool, n+1)
	dp[0] = true
	for i := 1; i <= n; i++ {
		for j := 0; j < i; j++ {
			if dp[j] && wordSet[s[j:i]] {
				dp[i] = true
				break
			}
		}
	}
	return dp[n]
}

func main() {
	fmt.Println(wordBreak("leetcode", []string{"leet", "code"}))
	// Output: true

	fmt.Println(wordBreak("applepenapple", []string{"apple", "pen"}))
	// Output: true

	fmt.Println(wordBreak("catsandog", []string{"cats", "dog", "sand", "and", "cat"}))
	// Output: false
}`,
      },
      {
        id: "partition-equal-subset-sum",
        title: "Partition Equal Subset Sum",
        difficulty: "Medium",
        leetcode: 416,
        description:
          "Given an integer array nums, return true if you can partition it into two subsets with equal sum.",
        examples: [
          { input: "nums = [1,5,11,5]", output: "true",  explanation: "[1,5,5] and [11] both sum to 11" },
          { input: "nums = [1,2,3,5]",  output: "false", explanation: "Cannot partition into equal sums" },
        ],
        approach:
          "Reduce to 0/1 knapsack: target = sum/2 (return false if odd). dp[j] = true if a subset sums to j. Iterate nums; for each num update dp right-to-left: dp[j] |= dp[j-num]. Answer is dp[target].",
        complexity: { time: "O(n × sum)", space: "O(sum)" },
        code: `package main

import "fmt"

func canPartition(nums []int) bool {
	total := 0
	for _, v := range nums { total += v }
	if total%2 != 0 { return false }
	target := total / 2

	dp := make([]bool, target+1)
	dp[0] = true
	for _, num := range nums {
		// iterate right-to-left to avoid reusing the same element
		for j := target; j >= num; j-- {
			dp[j] = dp[j] || dp[j-num]
		}
	}
	return dp[target]
}

func main() {
	fmt.Println(canPartition([]int{1, 5, 11, 5}))
	// Output: true

	fmt.Println(canPartition([]int{1, 2, 3, 5}))
	// Output: false

	fmt.Println(canPartition([]int{2, 2, 3, 5}))
	// Output: false
}`,
      },
      {
        id: "edit-distance",
        title: "Edit Distance",
        difficulty: "Medium",
        leetcode: 72,
        description:
          "Given two strings word1 and word2, return the minimum number of operations (insert, delete, replace) to convert word1 into word2.",
        examples: [
          { input: 'word1 = "horse", word2 = "ros"', output: "3", explanation: "horse→rorse(replace h→r)→rose(delete r)→ros(delete e)" },
          { input: 'word1 = "intention", word2 = "execution"', output: "5", explanation: "5 operations needed" },
        ],
        approach:
          "2D DP: dp[i][j] = min edits to convert word1[:i] to word2[:j]. If chars match: dp[i][j] = dp[i-1][j-1]. Otherwise: min(dp[i-1][j]+1 delete, dp[i][j-1]+1 insert, dp[i-1][j-1]+1 replace). Base cases: dp[i][0]=i, dp[0][j]=j.",
        complexity: { time: "O(m×n)", space: "O(m×n)" },
        code: `package main

import "fmt"

func minDistance(word1 string, word2 string) int {
	m, n := len(word1), len(word2)
	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
		dp[i][0] = i
	}
	for j := 0; j <= n; j++ { dp[0][j] = j }

	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if word1[i-1] == word2[j-1] {
				dp[i][j] = dp[i-1][j-1]
			} else {
				dp[i][j] = 1 + min(dp[i-1][j-1], min(dp[i-1][j], dp[i][j-1]))
			}
		}
	}
	return dp[m][n]
}

func min(a, b int) int {
	if a < b { return a }
	return b
}

func main() {
	fmt.Println(minDistance("horse", "ros"))
	// Output: 3

	fmt.Println(minDistance("intention", "execution"))
	// Output: 5

	fmt.Println(minDistance("", "abc"))
	// Output: 3
}`,
      },
    ],
  },
];
