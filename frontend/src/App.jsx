// frontend/src/App.jsx
import { useNavigate } from "react-router-dom";
import AudienceModal from "./components/AudienceModal.jsx";

const ASPIRE_LOGO =
  "https://raw.githubusercontent.com/scottyowen4683/Aspirereception/refs/heads/feature/ai-receptionist/frontend/aspire.png";

export default function App() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Popup chooser still appears */}
      <AudienceModal />

      <header className="w-full py-6">
        <div className="container mx-auto px-6 flex items-center justify-between">
          <img src={ASPIRE_LOGO} alt="Aspire Executive Solutions" className="h-10 w-auto" />
          {/* Quick switch: clears remembered audience and reopens modal */}
          <button
            onClick={() => {
              localStorage.removeItem("audience");
              window.location.reload();
            }}
            className="text-sm text-slate-600 hover:text-blue-600"
          >
            Switch audience
          </button>
        </div>
      </header>

      <main className="container mx-auto px-6 pt-10 pb-20 grid place-items-center">
        <div className="max-w-3xl text-center">
          <img src={ASPIRE_LOGO} alt="Aspire Executive Solutions" className="h-14 w-auto mx-auto mb-6" />
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
            Welcome to Aspire Executive Solutions
          </h1>
          <p className="mt-3 text-lg text-slate-700">
            So we can best help, are you here for <strong>Government</strong> or <strong>Business</strong> solutions?
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate("/government")}
              className="rounded-xl bg-blue-600 text-white px-6 py-3 hover:bg-blue-700"
            >
              Government Solutions
            </button>
            <button
              onClick={() => navigate("/business")}
              className="rounded-xl border border-slate-300 px-6 py-3 text-slate-800 hover:bg-white"
            >
              Business Solutions
            </button>
          </div>

          <p className="mt-4 text-sm text-slate-500">
            You can change this choice anytime using “Switch audience” (top right).
          </p>
        </div>
      </main>
    </div>
  );
}
