import { useEffect } from "react";

export default function VapiWidget({ assistantId }) {
  useEffect(() => {
    const existing = document.getElementById("vapi-widget-script");
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.id = "vapi-widget-script";
    script.src = "https://cdn.vapi.ai/widget/vapi-widget.min.js";
    script.async = true;
    script.onload = () => {
      // @ts-ignore
      window.vapiWidget?.init({
        apiKey: import.meta.env.VITE_VAPI_PUBLIC_KEY,
        assistant: assistantId,
        position: "bottom-right",
      });
    };
    document.body.appendChild(script);
    return () => {
      try { window.vapiWidget?.destroy(); } catch {}
    };
  }, [assistantId]);

  return null;
}// frontend/src/components/VapiWidget.jsx
import React, { useEffect, useRef } from "react";

/**
 * Usage:
 * <VapiWidget
 *   assistantId={import.meta.env.VITE_VAPI_ASSISTANT_ID_BUSINESS}
 *   publicKey={import.meta.env.VITE_VAPI_PUBLIC_KEY}
 * />
 *
 * Make sure Netlify has the VITE_ env vars set, then deploy without cache.
 */
export default function VapiWidget({ assistantId, publicKey }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const SCRIPT_ID = "vapi-widget-umd";

    const mountWidget = () => {
      if (!containerRef.current) return;

      // Reuse if already mounted
      let el = containerRef.current.querySelector("vapi-widget");
      if (!el) {
        el = document.createElement("vapi-widget");
        containerRef.current.appendChild(el);
      }

      if (assistantId) el.setAttribute("assistant-id", String(assistantId));
      if (publicKey) el.setAttribute("public-key", String(publicKey));
    };

    // load the script once per app
    let script = document.getElementById(SCRIPT_ID);
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src =
        "https://unpkg.com/@vapi-ai/client-sdk-react/dist/embed/widget.umd.js";
      script.async = true;
      script.type = "text/javascript";
      script.onload = mountWidget;
      document.body.appendChild(script);
    } else {
      // already loaded (SPA navigation), just mount/update widget
      mountWidget();
    }
  }, [assistantId, publicKey]);

  return <div id="vapi-mount" ref={containerRef} />;
}

