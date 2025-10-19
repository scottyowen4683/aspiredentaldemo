import React from "react";
import ReactDOM from "react-dom/client";

// ✅ Keep your global styles so the site looks normal
import "./index.css";

// ✅ Your existing app (leave App.jsx exactly as it was before)
import App from "./App.jsx";

// ✅ Our admin page
import AdminCalls from "./pages/admin.jsx";

// ✅ Simple, router-free switch: show Admin when path is /admin, else your normal app
function Root() {
  const path = window.location.pathname;
  if (path === "/admin") {
    return <AdminCalls />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
