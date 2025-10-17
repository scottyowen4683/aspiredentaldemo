// frontend/src/components/AudienceModal.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AudienceModal() {
  const [open, setOpen] = useState(false);
  const [remember, setRemember] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // If user has previously saved a choice, don’t auto-open,
    // but show a small “Reset choice” link in the header (handled in App)
    const saved = localStorage.getItem("audience");
    if (!saved) setOpen(true);
  }, []);

  const go = (aud) => {
    if (remember) localStorage.setItem("audience", aud);
    setOpen(false);
    navigate(aud === "government" ? "/government" : "/business");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div className="w-[92%] max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-xl font-semibold">Who are you here as?</h2>
        <p className="mb-5 text-sm text-gray-600">
          Pick the option that best fits you.
        </p>

        <div className="grid gap-3">
          <button
            onClick={() => go("government")}
            className="rounded-xl border p-3 hover:bg-gray-50"
          >
            Government
          </button>
          <button
            onClick={() => go("business")}
            className="rounded-xl border p-3 hover:bg-gray-50"
          >
            Business
          </button>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember my choice on this device
        </label>

        {/* Helpful hint to clear saved choice */}
        {localStorage.getItem("audience") && (
          <button
            onClick={() => {
              localStorage.removeItem("audience");
              // keep modal open so they can re-choose
            }}
            className="mt-3 text-xs text-blue-600 hover:underline"
          >
            Reset saved choice
          </button>
        )}
      </div>
    </div>
  );
}
