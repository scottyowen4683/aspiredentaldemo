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
}
