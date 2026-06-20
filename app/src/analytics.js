/* =====================================================================
   Anonymous Google Analytics 4 — ported from the legacy app so tracking
   continues uninterrupted after the migration to the React UI.
   Same Measurement ID as before (G-DEDV833VML). The gtag library is
   loaded lazily on first event; IP is anonymized and page views are
   sent manually (SPA), mirroring the legacy behaviour. All calls are
   best-effort and never throw — analytics must never break the app.
   ===================================================================== */
const GA_MEASUREMENT_ID = "G-DEDV833VML";
const APP_VERSION = "react-1";

export function analyticsEnabled() {
  return /^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID || "") && GA_MEASUREMENT_ID !== "G-XXXXXXXXXX";
}

function loadAnalytics() {
  if (!analyticsEnabled() || window.__gaLoaded) return;
  window.__gaLoaded = true;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, {
      send_page_view: false,
      anonymize_ip: true,
      cookie_flags: "SameSite=None;Secure",
    });
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_MEASUREMENT_ID);
    document.head.appendChild(s);
  }
}

// Shared context (language / view / admin) attached to every event, set by App.
let CTX = { app_language: "en", app_view: "home", is_admin: false };
export function setAnalyticsContext(ctx) { CTX = { ...CTX, ...ctx }; }

export function trackEvent(name, params) {
  try {
    if (!analyticsEnabled()) return;
    loadAnalytics();
    window.gtag("event", name, Object.assign({
      app_version: APP_VERSION,
      app_language: CTX.app_language,
      app_view: CTX.app_view,
      is_admin: !!CTX.is_admin,
    }, params || {}));
  } catch (_) { /* analytics must never break the app */ }
}

export function trackPageView(view) {
  try {
    if (!analyticsEnabled()) return;
    loadAnalytics();
    const v = view || CTX.app_view || "home";
    window.gtag("event", "page_view", {
      page_title: "World Cup 2026 - " + v,
      page_location: location.href.split("#")[0] + "#" + v,
      page_path: "/" + v,
      app_version: APP_VERSION,
      app_language: CTX.app_language,
      is_admin: !!CTX.is_admin,
    });
  } catch (_) { /* no-op */ }
}
