import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initAnalytics, trackPageView } from "../firebase";

let initialized = false;

export default function Analytics() {
  const location = useLocation();

  useEffect(() => {
    if (initialized) return;
    initialized = true;
    initAnalytics().then((analytics) => {
      if (analytics) trackPageView(location.pathname);
    });
  }, []);

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return null;
}
