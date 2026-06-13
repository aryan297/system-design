import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported, logEvent } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let analytics = null;

export async function initAnalytics() {
  if (!firebaseConfig.apiKey || !firebaseConfig.measurementId) {
    return null;
  }
  if (!(await isSupported())) {
    return null;
  }
  const app = initializeApp(firebaseConfig);
  analytics = getAnalytics(app);
  return analytics;
}

export function trackPageView(path) {
  if (!analytics) return;
  logEvent(analytics, "page_view", { page_path: path });
}
