// frontend/src/components/VapiWidget.jsx
import React, { useEffect, useRef } from "react";

const SCRIPT_SRC =
  "https://unpkg.com/@vapi-ai/client-sdk-react/dist/embed/widget.umd.js";

export default function VapiWidget({
  assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID_BUSINESS,
  publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ATTR = "data-vapi-widget-script";

    const waitForDefined = (timeoutMs = 2000) =>
      new Promise((resolve) => {
        const start = Date.now();
        const check = () => {
          const ok = !!window.customElements?.get?.("vapi-widget");
          if (ok || Date.now() - start > timeoutMs) return resolve(ok);
          requestAnimationFrame(check);
        };
        check();
      });

    const ensureScript = () =>
      new Promise((resolve, reject) => {
        let s = document.querySelector(`script[${ATTR}]`);
        if (s) {
          if (s.dataset.loaded === "true") return resolve("existing");
          s.addEventListener("load", () => resolve("loaded-existing"), { once: true });
          s.addEventListener("error", reject, { once: true });
          return;
        }
        s = document.createElement("script");
        s.src = SCRIPT_SRC;
        s.async = true;
        s.type = "text/javascript";
        s.setAttribute(ATTR, "true");
        s.addEventListener("load", () => {
          s.dataset.loaded = "true";
          resolve("loaded-new");
        });
        s.addEventListener("error", reject, { once: true });
        document.body.appendChild(s);
      });

    const render = () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";
      const el = document.createElement("vapi-widget");
      if (assistantId) el.setAttribute("assistant-id", assistantId);
      if (publicKey) el.setAttribute("public-key", publicKey);
      // keep it visible while testing
      el.style.position = "fixed";
      el.style.bottom = "16px";
      el.style.right = "16px";
      el.style.zIndex = "2147483647";
      containerRef.current.appendChild(el);
    };

    (async () => {
      try {
        await ensureScript();
        const defined = await waitForDefined(2000);
        if (!defined) {
          console.error("[VapiWidget] custom element not defined.");
          return;
        }
        render();
      } catch (e) {
        console.error("[VapiWidget] failed to load script:", e);
      }
    })();
  }, [assistantId, publicKey]);

  return <div ref={containerRef} />;
}
