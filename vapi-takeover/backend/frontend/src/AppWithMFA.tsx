import { Component, ErrorInfo, ReactNode } from "react";
import App from "./App";

// Error Boundary to catch React errors
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('React Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const error = this.state.error;
      // Extract as much info as possible from the error
      const errorName = error?.name || 'Unknown';
      const errorMessage = error?.message || 'No message';
      const errorStack = error?.stack || 'No stack trace';
      const errorString = String(error);

      return (
        <div style={{
          padding: '20px',
          backgroundColor: '#1a1a2e',
          color: 'white',
          minHeight: '100vh',
          fontFamily: 'monospace'
        }}>
          <h1 style={{ color: '#ff6b6b' }}>Something went wrong</h1>
          <div style={{
            backgroundColor: '#0f0f1a',
            padding: '15px',
            borderRadius: '8px',
            overflow: 'auto',
            marginBottom: '15px'
          }}>
            <p><strong>Name:</strong> {errorName}</p>
            <p><strong>Message:</strong> {errorMessage}</p>
            <p><strong>String:</strong> {errorString}</p>
          </div>
          <pre style={{
            backgroundColor: '#0f0f1a',
            padding: '15px',
            borderRadius: '8px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}>
            {errorStack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              backgroundColor: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// MFA checking is handled by Auth.tsx routes (/vmf for verification, /emf for enrollment)
// This wrapper just provides error boundary protection
export default function AppWithMFA() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
