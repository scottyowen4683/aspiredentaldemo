// frontend/src/components/VapiWidget.jsx
import React, { useEffect, useRef } from "react";

/**
 * VapiWidget
 * - Loads the Vapi widget script once
 * - Renders a <vapi-widget> custom element into a container
 * - Uses props if provided, otherwise falls back to VITE_ env vars
 */
export default function VapiWidget({
  assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID_BUSINESS,
  publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const SCRIPT_SRC =
      "https://unpkg.com/@vapi-ai/client-sdk-react/dist/embed/widget.umd.js";
    const SCRIPT_ATTR = "data-vapi-widget-script";

    const ensureScript = () =>
      new Promise((resolve) => {
        // Avoid adding the script multiple times
        let script = document.querySelector(`script[${SCRIPT_ATTR}]`);
        if (script) return resolve();

        script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.type = "text/javascript";
        script.setAttribute(SCRIPT_ATTR, "true");
        script.addEventListener("load", () => resolve());
        document.body.appendChild(script);
      });

    const renderWidget = () => {
      if (!containerRef.current) return;
      // Clear any previous widget
      containerRef.current.innerHTML = "";

      const el = document.createElement("vapi-widget");
      if (assistantId) el.setAttribute("assistant-id", assistantId);
      if (publicKey) el.setAttribute("public-key", publicKey);
      containerRef.current.appendChild(el);
    };

    ensureScript().then(renderWidget);

    // No teardown required; the custom element is lightweight.
  }, [assistantId, publicKey]);

  return <div ref={containerRef} />;
}
