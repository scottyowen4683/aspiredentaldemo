import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AudienceModal() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem("audience");
    if (!saved) setOpen(true);
  }, []);

  const choose = (aud) => {
    localStorage.setItem("audience", aud);
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
          <button onClick={() => choose("government")} className="rounded-xl border p-3 hover:bg-gray-50">
            Government
          </button>
          <button onClick={() => choose("business")} className="rounded-xl border p-3 hover:bg-gray-50">
            Business
          </button>
        </div>
      </div>
    </div>
  );
}
