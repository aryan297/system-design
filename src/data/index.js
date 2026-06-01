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
import { IRCTC_HLD, IRCTC_LLD, IRCTC_QNA } from "./irctc";
import { DEZERV_HLD, DEZERV_LLD, DEZERV_QNA } from "./dezerv";
import { GOOGLE_DRIVE_HLD, GOOGLE_DRIVE_LLD, GOOGLE_DRIVE_QNA } from "./googledrive";
import { HOTSTAR_HLD, HOTSTAR_LLD, HOTSTAR_QNA } from "./hotstar";
import { DYNAMODB_HLD, DYNAMODB_LLD, DYNAMODB_QNA } from "./dynamodb";

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
  irctc: {
    meta: { icon: "🚂", color: "#1A56DB" },
    hld: IRCTC_HLD,
    lld: IRCTC_LLD,
    qna: IRCTC_QNA,
  },
  dezerv: {
    meta: { icon: "💎", color: "#7C3AED" },
    hld: DEZERV_HLD,
    lld: DEZERV_LLD,
    qna: DEZERV_QNA,
  },
  "google-drive": {
    meta: { icon: "📁", color: "#4285F4" },
    hld: GOOGLE_DRIVE_HLD,
    lld: GOOGLE_DRIVE_LLD,
    qna: GOOGLE_DRIVE_QNA,
  },
  hotstar: {
    meta: { icon: "🏏", color: "#1F3C88" },
    hld: HOTSTAR_HLD,
    lld: HOTSTAR_LLD,
    qna: HOTSTAR_QNA,
  },
  "dynamo-db": {
    meta: { icon: "🗄️", color: "#FF9900" },
    hld: DYNAMODB_HLD,
    lld: DYNAMODB_LLD,
    qna: DYNAMODB_QNA,
  },
};

export function getSystem(id) {
  return REGISTRY[id] ?? null;
}

export function getAllSystems() {
  return Object.keys(REGISTRY);
}
