// frontend/src/components/VapiWidget.jsx
import React, { useEffect, useRef } from "react";

const SCRIPT_SRC = "https://unpkg.com/@vapi-ai/client-sdk-react/dist/embed/widget.umd.js";
const SCRIPT_ATTR = "data-vapi-widget-script";

export default function VapiWidget({
  assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID_BUSINESS,
  publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1) Always render the tag immediately
    containerRef.current.innerHTML = "";
    const el = document.createElement("vapi-widget");
    if (assistantId) el.setAttribute("assistant-id", assistantId);
    if (publicKey) el.setAttribute("public-key", publicKey);

    // keep visible above sticky stuff while testing
    el.style.position = "fixed";
    el.style.bottom = "16px";
    el.style.right = "16px";
    el.style.zIndex = "2147483647";

    containerRef.current.appendChild(el);

    // 2) Ensure the script exists (only once)
    let script = document.querySelector(`script[${SCRIPT_ATTR}]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.type = "text/javascript";
      script.setAttribute(SCRIPT_ATTR, "true");
      document.body.appendChild(script);
    }

    // cleanup on unmount / id change
    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [assistantId, publicKey]);

  return <div ref={containerRef} />;
}
