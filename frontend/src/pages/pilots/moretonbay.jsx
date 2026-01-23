import React from "react";
import VapiWidget from "../../components/Vapi-Widget.jsx";

const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_MORETON;
const tenantId = "moreton";

export default function MoretonBayPilot() {
  const isConfigured = Boolean(assistantId);

  return (
    <div className="min-h-screen bg-[#070A12] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-60">
        <div className="absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-white/10 blur-[120px]" />
        <div className="absolute bottom-[-240px] right-[-140px] h-[520px] w-[520px] rounded-full bg-white/10 blur-[140px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-[0_18px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-4">
                <img
                  src="/aspire1.png"
                  alt="Aspire Executive Solutions"
                  className="h-10 w-auto opacity-95"
                />
                <div className="h-8 w-px bg-white/15" />
                <img
                  src="/moretonbaylogo.png"
                  alt="Moreton Bay"
                  className="h-10 w-auto opacity-95"
                />
              </div>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
              <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
              Pilot environment • Chat evaluation only
            </div>
          </div>

          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Aspire AI Chat Pilot — Moreton Bay
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/70 md:text-base">
              This page is a controlled evaluation environment to trial an AI
              assistant for common, low-risk enquiries. It is vendor-hosted and
              not connected to Council systems.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Scope</div>
              <div className="mt-1 text-sm text-white/65">
                Informational enquiries only (e.g. bins, complaints, opening
                hours, general guidance).
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Governance</div>
              <div className="mt-1 text-sm text-white/65">
                Designed to escalate or stop when a request is outside scope.
                Council remains in control.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Urgent matters</div>
              <div className="mt-1 text-sm text-white/65">
                Not for emergencies. For urgent issues, use official Council
                channels.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="text-sm font-semibold">Pilot support & escalation</div>
            <div className="mt-1 text-sm text-white/70">
              For any queries or escalations, please contact{" "}
              <span className="font-semibold text-white">Scott</span> on{" "}
              <a
                href="tel:0408 062 129"
                className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/60"
              >
                0408 062 129
              </a>
              .
            </div>
          </div>

          <div className="text-xs leading-relaxed text-white/55">
            By using this pilot, you acknowledge responses may be incomplete or
            subject to change. Please avoid entering sensitive personal
            information unless explicitly required for a specific task.
          </div>
        </header>

        <main className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-white/90">How to test</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              Ask a few typical questions. Focus on clarity, accuracy, escalation
              behaviour and tone.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {[
                "What day is my bin collected?",
                "Who is my local councillor?",
                "Where can I find Council opening hours?",
                "What is the cost for dog registration?",
                "How do I report an issue?",
                "What are the contact options for support?",
              ].map((q) => (
                <div
                  key={q}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/70"
                >
                  {q}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Notes for reviewers</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/65">
                <li>Does the assistant stay within low-risk scope?</li>
                <li>Does it route/escalate when uncertain?</li>
                <li>Is the tone appropriate and calm?</li>
                <li>Are responses consistent and clearly worded?</li>
              </ul>
            </div>
          </section>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-white/90">Pilot constraints</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/65">
              <li>• No payments or account-specific actions</li>
              <li>• No decisions or formal determinations</li>
              <li>• No access to internal Council systems in this pilot</li>
              <li>• Escalation/deflection is intentional</li>
            </ul>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Assistant status</div>
              <div className="mt-2 text-xs text-white/60">
                Status:{" "}
                <span className={isConfigured ? "text-emerald-300" : "text-amber-300"}>
                  {isConfigured ? "Configured" : "Not configured"}
                </span>
              </div>

              {!isConfigured && (
                <div className="mt-2 text-xs text-white/55 leading-relaxed">
                  The assistant is not available because the environment variable
                  is not set in this deployment.
                </div>
              )}
            </div>
          </aside>
        </main>

        <VapiWidget
          assistantId={assistantId}
          tenantId={tenantId}
          title="Moreton Bay • Aspire AI Chat Pilot"
          greeting="Hi — I'm the City of Moreton bay AI assistant. How can I help you today? For urgent matters, please use Council's official channels."
          brandUrl="https://aspireexecutive.ai"
        />
      </div>
    </div>
  );
}
