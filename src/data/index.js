import { NETFLIX_HLD, NETFLIX_LLD, NETFLIX_QNA } from "./netflix";
import { UBER_HLD, UBER_LLD, UBER_QNA } from "./uber";
import { YOUTUBE_HLD, YOUTUBE_LLD, YOUTUBE_QNA } from "./youtube";
import { SPOTIFY_HLD, SPOTIFY_LLD, SPOTIFY_QNA } from "./spotify";
import { INSTAGRAM_HLD, INSTAGRAM_LLD, INSTAGRAM_QNA } from "./instagram";

// Registry — add new systems here only. No new page files needed.
const REGISTRY = {
  netflix: {
    meta: { icon: "🎬", color: "#E50914" },
    hld: NETFLIX_HLD,
    lld: NETFLIX_LLD,
    qna: NETFLIX_QNA,
  },
  uber: {
    meta: { icon: "🚗", color: "#000000" },
    hld: UBER_HLD,
    lld: UBER_LLD,
    qna: UBER_QNA,
  },
  youtube: {
    meta: { icon: "▶️", color: "#FF0000" },
    hld: YOUTUBE_HLD,
    lld: YOUTUBE_LLD,
    qna: YOUTUBE_QNA,
  },
  spotify: {
    meta: { icon: "🎵", color: "#1DB954" },
    hld: SPOTIFY_HLD,
    lld: SPOTIFY_LLD,
    qna: SPOTIFY_QNA,
  },
  instagram: {
    meta: { icon: "📸", color: "#E1306C" },
    hld: INSTAGRAM_HLD,
    lld: INSTAGRAM_LLD,
    qna: INSTAGRAM_QNA,
  },
};

export function getSystem(id) {
  return REGISTRY[id] ?? null;
}

export function getAllSystems() {
  return Object.keys(REGISTRY);
}
