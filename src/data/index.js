import { NETFLIX_HLD, NETFLIX_LLD, NETFLIX_QNA } from "./netflix";
import { UBER_HLD, UBER_LLD, UBER_QNA } from "./uber";
import { YOUTUBE_HLD, YOUTUBE_LLD, YOUTUBE_QNA } from "./youtube";
import { SPOTIFY_HLD, SPOTIFY_LLD, SPOTIFY_QNA } from "./spotify";
import { INSTAGRAM_HLD, INSTAGRAM_LLD, INSTAGRAM_QNA } from "./instagram";
import { REVOLUT_HLD, REVOLUT_LLD, REVOLUT_QNA } from "./revolut";
import { PAYPAL_HLD, PAYPAL_LLD, PAYPAL_QNA } from "./paypal";
import { ZEPTO_HLD, ZEPTO_LLD, ZEPTO_QNA } from "./zepto";
import { STRIPE_HLD, STRIPE_LLD, STRIPE_QNA } from "./stripe";
import { GROWW_HLD, GROWW_LLD, GROWW_QNA } from "./groww";
import { TIKTOK_HLD, TIKTOK_LLD, TIKTOK_QNA } from "./tiktok";
import { ZOMATO_HLD, ZOMATO_LLD, ZOMATO_QNA } from "./zomato";

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
  revolut: {
    meta: { icon: "💳", color: "#0075EB" },
    hld: REVOLUT_HLD,
    lld: REVOLUT_LLD,
    qna: REVOLUT_QNA,
  },
  paypal: {
    meta: { icon: "💰", color: "#003087" },
    hld: PAYPAL_HLD,
    lld: PAYPAL_LLD,
    qna: PAYPAL_QNA,
  },
  zepto: {
    meta: { icon: "⚡", color: "#8B2FC9" },
    hld: ZEPTO_HLD,
    lld: ZEPTO_LLD,
    qna: ZEPTO_QNA,
  },
  stripe: {
    meta: { icon: "💜", color: "#635BFF" },
    hld: STRIPE_HLD,
    lld: STRIPE_LLD,
    qna: STRIPE_QNA,
  },
  groww: {
    meta: { icon: "📈", color: "#00D09C" },
    hld: GROWW_HLD,
    lld: GROWW_LLD,
    qna: GROWW_QNA,
  },
  tiktok: {
    meta: { icon: "🎵", color: "#010101" },
    hld: TIKTOK_HLD,
    lld: TIKTOK_LLD,
    qna: TIKTOK_QNA,
  },
  zomato: {
    meta: { icon: "🍔", color: "#E23744" },
    hld: ZOMATO_HLD,
    lld: ZOMATO_LLD,
    qna: ZOMATO_QNA,
  },
};

export function getSystem(id) {
  return REGISTRY[id] ?? null;
}

export function getAllSystems() {
  return Object.keys(REGISTRY);
}
