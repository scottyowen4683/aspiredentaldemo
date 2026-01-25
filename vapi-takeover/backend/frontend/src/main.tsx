import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import AppWithMFA from "./AppWithMFA.tsx";

// Apply persisted theme (or system preference) before React mounts to avoid
// a flash of incorrect theme on load.
try {
	const persisted = localStorage.getItem('theme');
	if (persisted === 'dark') {
		document.documentElement.classList.add('dark');
	} else if (persisted === 'light') {
		document.documentElement.classList.remove('dark');
	} else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
		document.documentElement.classList.add('dark');
	} else {
		document.documentElement.classList.remove('dark');
	}
} catch (e) {
	// ignore access errors (e.g., private mode)
}

// createRoot(document.getElementById("root")!).render(<App />);
createRoot(document.getElementById("root")!).render(<AppWithMFA />);
