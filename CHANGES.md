# Design System — Change Log & Pending Work

## Completed

### System Design Cards
All 7 systems added to `src/data/systems.js` and `src/data/index.js`:
- **Netflix** — Video streaming, CDN, adaptive bitrate
- **Uber** — Real-time ride matching, geospatial, surge pricing
- **YouTube** — Upload pipeline, recommendations, ABR/DASH playback
- **Spotify** — Audio delivery, Discover Weekly (ALS matrix factorization), royalty counting
- **Instagram** — Media upload, TAO social graph, Haystack/f4 storage, Reels ranking
- **Revolut** — Double-entry ledger, card auth < 100ms, FX, fraud/AML
- **PayPal** — Payment processing, chargeback fraud, One Touch checkout, Venmo, dispute resolution

### Data Files Created
| File | Exports |
|---|---|
| `src/data/netflix.js` | NETFLIX_HLD, NETFLIX_LLD, NETFLIX_QNA |
| `src/data/uber.js` | UBER_HLD, UBER_LLD, UBER_QNA |
| `src/data/youtube.js` | YOUTUBE_HLD, YOUTUBE_LLD, YOUTUBE_QNA |
| `src/data/spotify.js` | SPOTIFY_HLD, SPOTIFY_LLD, SPOTIFY_QNA |
| `src/data/instagram.js` | INSTAGRAM_HLD, INSTAGRAM_LLD, INSTAGRAM_QNA |
| `src/data/revolut.js` | REVOLUT_HLD, REVOLUT_LLD, REVOLUT_QNA |
| `src/data/paypal.js` | PAYPAL_HLD, PAYPAL_LLD, PAYPAL_QNA |

### Registry (`src/data/index.js`)
All 7 systems registered. `getSystem(id)` and `getAllSystems()` work for all.

### Routing (`src/App.jsx`)
Generic routes handle all systems — no new page files per system:
- `/:systemId/hld` → `<SystemHLD />`
- `/:systemId/lld` → `<SystemLLD />`

---

## Pending — DSA Section

### What to build
A DSA (Data Structures & Algorithms) section with Go language solutions, sidebar category dropdowns, and per-problem detail view (Input → Output → Logic → Code).

### Files to create/modify

| File | Action | Notes |
|---|---|---|
| `src/data/dsa.js` | **Create** | 11 categories × 10 problems, Go solutions |
| `src/pages/DSAPage.jsx` | **Create** | Split view: category list (left) + problem detail (right) |
| `src/pages/DSAPage.css` | **Create** | Styles for DSA page |
| `src/components/Sidebar.jsx` | **Update** | Add collapsible DSA section with 11 category dropdowns |
| `src/App.jsx` | **Update** | Add route `/dsa/:categoryId/:problemId` |

### 11 DSA Categories (10 problems each)
1. Arrays + Two Pointers
2. Sliding Window
3. Prefix Sum
4. Hashing
5. Stack
6. Binary Search
7. Linked List
8. Trees
9. Graphs
10. Backtracking
11. Dynamic Programming

### Per-problem data shape
```js
{
  id: "two-sum",
  title: "Two Sum",
  difficulty: "Easy",       // Easy | Medium | Hard
  leetcode: 1,              // LeetCode problem number
  description: "...",
  examples: [
    { input: "nums = [2,7,11,15], target = 9", output: "[0,1]", explanation: "..." }
  ],
  approach: "...",          // logic / strategy explanation
  complexity: { time: "O(n)", space: "O(n)" },
  code: `func twoSum(...) { ... }`   // Go solution
}
```

### Routing plan
- `/dsa` → redirect to first problem of first category
- `/dsa/:categoryId/:problemId` → `<DSAPage />`

### Sidebar plan
- New collapsible "DSA" section below "Systems"
- Each of 11 categories is a dropdown
- Each dropdown lists 10 problem links
- Active state highlights current problem
