import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AudienceModal from "./components/AudienceModal.jsx";

export default function App() {
  const navigate = useNavigate();
  useEffect(() => {
    const saved = localStorage.getItem("audience");
    if (saved === "government") navigate("/government");
    if (saved === "business") navigate("/business");
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <h1 className="text-2xl font-bold p-6">Aspire Executive Solutions</h1>
      <AudienceModal />
    </div>
  );
}
