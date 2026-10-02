"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className="dark">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#11131c", color: "#e7e9f0", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ opacity: 0.7, fontSize: 14 }}>An unexpected error occurred. Please try again.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: "1px solid #333a4d", background: "#1a1e2b", color: "inherit", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
