// frontend/src/components/VapiWidget.jsx
import React, { useEffect, useRef } from "react";

const PRIMARY_SRC = "https://unpkg.com/@vapi-ai/client-sdk-react/dist/embed/widget.umd.js";

export default function VapiWidget({
  assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID_BUSINESS,
  publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const SCRIPT_ATTR = "data-vapi-widget-script";
    const log = (...a) => console.log("[VapiWidget]", ...a);

    const waitForDefined = (ms) =>
      new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          const defined = !!window.customElements?.get?.("vapi-widget");
          if (defined || Date.now() - start > ms) return resolve(defined);
          requestAnimationFrame(tick);
        };
        tick();
      });

    const injectScript = (src) =>
      new Promise((resolve, reject) => {
        // Avoid duplicate insertions
        let existing = document.querySelector(`script[${SCRIPT_ATTR}]`);
        if (existing) {
          if (existing.dataset.vapiLoaded === "true") return resolve("already-loaded");
          existing.addEventListener("load", () => resolve("loaded-existing"), { once: true });
          existing.addEventListener("error", (e) => reject(e), { once: true });
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.type = "text/javascript";
        s.setAttribute(SCRIPT_ATTR, "true");
        s.addEventListener("load", () => {
          s.dataset.vapiLoaded = "true";
          resolve("loaded-new");
        });
        s.addEventListener("error", (e) => reject(e));
        document.body.appendChild(s);
      });

    const renderWidget = () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";
      const el = document.createElement("vapi-widget");
      if (assistantId) el.setAttribute("assistant-id", assistantId);
      if (publicKey) el.setAttribute("public-key", publicKey);

      // keep it visible above any sticky elements while testing
      el.style.position = "fixed";
      el.style.bottom = "16px";
      el.style.right = "16px";
      el.style.zIndex = "2147483647";

      // (Optional) example customization:
      // el.setAttribute("theme", "light");
      // el.setAttribute("position", "bottom-right");

      containerRef.current.appendChild(el);
    };

    (async () => {
      try {
        log("init: ids", {
          assistantId: (assistantId || "").slice(0, 8) + "…",
          publicKey: (publicKey || "").slice(0, 8) + "…",
        });

        const src1 = PRIMARY_SRC;
        const result1 = await injectScript(src1);
        log("script status:", result1);

        let defined = await waitForDefined(1500);
        log("custom element defined after primary?", defined);

        // If still not defined, force a re-load with cache-busting
        if (!defined) {
          const bust = `${PRIMARY_SRC}?v=${Date.now()}`;
          log("retrying with cache-bust:", bust);
          // Remove the old script tag so we truly reload
          const old = document.querySelector(`script[${SCRIPT_ATTR}]`);
          if (old) old.remove();
          const result2 = await injectScript(bust);
          log("retry result:", result2);
          defined = await waitForDefined(2000);
          log("custom element defined after retry?", defined);
        }

        if (!defined) {
          console.error(
            "[VapiWidget] vapi-widget custom element failed to register. " +
              "Check the Console for CSP errors and network blocks."
          );
          return;
        }

        renderWidget();
      } catch (e) {
        console.error("[VapiWidget] failed to init:", e);
      }
    })();

    // re-render when IDs change
  }, [assistantId, publicKey]);

  return <div ref={containerRef} />;
}
// frontend/src/components/VapiWidget.jsx
import React, { useEffect, useRef } from "react";

const PRIMARY_SRC = "https://unpkg.com/@vapi-ai/client-sdk-react/dist/embed/widget.umd.js";

export default function VapiWidget({
  assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID_BUSINESS,
  publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const SCRIPT_ATTR = "data-vapi-widget-script";
    const log = (...a) => console.log("[VapiWidget]", ...a);

    const waitForDefined = (ms) =>
      new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          const defined = !!window.customElements?.get?.("vapi-widget");
          if (defined || Date.now() - start > ms) return resolve(defined);
          requestAnimationFrame(tick);
        };
        tick();
      });

    const injectScript = (src) =>
      new Promise((resolve, reject) => {
        // Avoid duplicate insertions
        let existing = document.querySelector(`script[${SCRIPT_ATTR}]`);
        if (existing) {
          if (existing.dataset.vapiLoaded === "true") return resolve("already-loaded");
          existing.addEventListener("load", () => resolve("loaded-existing"), { once: true });
          existing.addEventListener("error", (e) => reject(e), { once: true });
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.type = "text/javascript";
        s.setAttribute(SCRIPT_ATTR, "true");
        s.addEventListener("load", () => {
          s.dataset.vapiLoaded = "true";
          resolve("loaded-new");
        });
        s.addEventListener("error", (e) => reject(e));
        document.body.appendChild(s);
      });

    const renderWidget = () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";
      const el = document.createElement("vapi-widget");
      if (assistantId) el.setAttribute("assistant-id", assistantId);
      if (publicKey) el.setAttribute("public-key", publicKey);

      // keep it visible above any sticky elements while testing
      el.style.position = "fixed";
      el.style.bottom = "16px";
      el.style.right = "16px";
      el.style.zIndex = "2147483647";

      // (Optional) example customization:
      // el.setAttribute("theme", "light");
      // el.setAttribute("position", "bottom-right");

      containerRef.current.appendChild(el);
    };

    (async () => {
      try {
        log("init: ids", {
          assistantId: (assistantId || "").slice(0, 8) + "…",
          publicKey: (publicKey || "").slice(0, 8) + "…",
        });

        const src1 = PRIMARY_SRC;
        const result1 = await injectScript(src1);
        log("script status:", result1);

        let defined = await waitForDefined(1500);
        log("custom element defined after primary?", defined);

        // If still not defined, force a re-load with cache-busting
        if (!defined) {
          const bust = `${PRIMARY_SRC}?v=${Date.now()}`;
          log("retrying with cache-bust:", bust);
          // Remove the old script tag so we truly reload
          const old = document.querySelector(`script[${SCRIPT_ATTR}]`);
          if (old) old.remove();
          const result2 = await injectScript(bust);
          log("retry result:", result2);
          defined = await waitForDefined(2000);
          log("custom element defined after retry?", defined);
        }

        if (!defined) {
          console.error(
            "[VapiWidget] vapi-widget custom element failed to register. " +
              "Check the Console for CSP errors and network blocks."
          );
          return;
        }

        renderWidget();
      } catch (e) {
        console.error("[VapiWidget] failed to init:", e);
      }
    })();

    // re-render when IDs change
  }, [assistantId, publicKey]);

  return <div ref={containerRef} />;
}
