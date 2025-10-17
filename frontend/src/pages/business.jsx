import VapiWidget from "../components/VapiWidget.jsx";

export default function Business() {
  return (
    <div className="min-h-screen p-6">
      <h1 className="text-2xl font-bold mb-2">Business Solutions</h1>
      <p className="text-gray-700 mb-4">
        AI reception, customer service, bookings, and automations for SMEs.
      </p>
      <VapiWidget assistantId={import.meta.env.VITE_VAPI_ASSISTANT_ID_BIZ} />
    </div>
  );
}
