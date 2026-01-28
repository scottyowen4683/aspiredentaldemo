// frontend/src/pages/Admin.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function Badge({ tone = "gray", children }) {
  const toneMap = {
    green: "bg-green-100 text-green-800",
    yellow: "bg-yellow-100 text-yellow-800",
    red: "bg-red-100 text-red-800",
    gray: "bg-gray-100 text-gray-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${toneMap[tone] || toneMap.gray}`}>
      {children}
    </span>
  );
}

function scoreToneLabel(score) {
  if (typeof score !== "number") return { tone: "gray", label: "Eval pending" };
  if (score >= 90) return { tone: "green", label: `Excellent (${score})` };
  if (score >= 70) return { tone: "yellow", label: `Good (${score})` };
  return { tone: "red", label: `Needs Review (${score})` };
}

export default function Admin() {
  const [stats, setStats] = useState({ total: 0, containment: 0, aht: 0 });
  const [rows, setRows] = useState([]); // from admin_sessions_recent
  const [topQs, setTopQs] = useState([]); // from top_questions_30d

  const [detail, setDetail] = useState(null);
  // detail = { id, provider_session_id, assistant_name, started_at, aht_seconds, outcome, score, ... }
  const [detailTab, setDetailTab] = useState("transcript"); // 'transcript' | 'eval'
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTranscript, setDetailTranscript] = useState("");
  const [detailEval, setDetailEval] = useState(null); // { overall_score, summary, suggestions: [] }

  useEffect(() => {
    async function load() {
      const sinceISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Sessions (from the view you created)
      const { data: recent, error } = await supabase
        .from("admin_sessions_recent")
        .select("*")
        .gte("started_at", sinceISO)
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) {
        console.error("admin_sessions_recent error", error);
        return;
      }

      // KPIs
      const total = recent.length;
      const resolved = recent.filter(r => r.outcome === "resolved").length;
      const containment = total ? Math.round((resolved / total) * 100) : 0;
      const aht = total && recent.some(r => r.aht_seconds != null)
        ? Math.round(recent.reduce((acc, r) => acc + (r.aht_seconds || 0), 0) / total)
        : 0;

      // Scores
      const graded = recent.map(r => {
        const score = typeof r.overall_score === "number"
          ? Math.max(0, Math.min(100, Math.round(r.overall_score)))
          : (r.outcome === "resolved" ? 100 : 0);
        const { tone, label } = scoreToneLabel(score);
        return { ...r, score, scoreTone: tone, scoreLabel: label };
      });

      setStats({ total, containment, aht });
      setRows(graded);

      // Top Questions (30 days)
      const { data: qdata, error: qerr } = await supabase
        .from("top_questions_30d")
        .select("*")
        .order("times", { ascending: false })
        .limit(12);
      if (!qerr && qdata) setTopQs(qdata);
    }
    load();
  }, []);

  async function refreshTopQs() {
    // Optional: try to refresh materialized view (if function exists)
    await supabase.rpc("refresh_top_questions_30d").catch(() => {});
    const { data } = await supabase
      .from("top_questions_30d")
      .select("*")
      .order("times", { ascending: false })
      .limit(12);
    if (data) setTopQs(data);
  }

  async function openDetails(row) {
    setDetail({
      id: row.id,
      provider_session_id: row.provider_session_id,
      assistant_name: row.assistant_name,
      started_at: row.started_at,
      aht_seconds: row.aht_seconds,
      outcome: row.outcome,
      score: row.score,
      scoreLabel: row.scoreLabel,
      scoreTone: row.scoreTone,
      summary: row.summary || "",
    });
    setDetailLoading(true);
    setDetailTab("transcript");
    setDetailTranscript("");
    setDetailEval(null);

    try {
      // Load full transcript
      const { data: art } = await supabase
        .from("session_artifacts")
        .select("transcript_full")
        .eq("session_id", row.id)
        .limit(1)
        .maybeSingle();
      if (art?.transcript_full) setDetailTranscript(art.transcript_full);

      // Load latest eval
      const { data: evals } = await supabase
        .from("eval_runs")
        .select("overall_score, summary, suggestions, status, completed_at")
        .eq("session_id", row.id)
        .order("started_at", { ascending: false })
        .limit(1);
      if (evals && evals[0]) {
        setDetailEval(evals[0]);
      }
    } catch (e) {
      console.error("detail load error", e);
    } finally {
      setDetailLoading(false);
    }
  }

  const td = "px-3 py-3 align-top border-b border-gray-100 text-sm";
  const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b";

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-xl font-bold mb-6">Aspire AI — Admin Dashboard</h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-gray-500 text-sm">Total Sessions (30 days)</div>
          <div className="text-3xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-gray-500 text-sm">Containment %</div>
          <div className="text-3xl font-bold">{stats.containment}%</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-gray-500 text-sm">Avg Handle Time (s)</div>
          <div className="text-3xl font-bold">{stats.aht}</div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sessions table */}
        <div className="lg:col-span-3 bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>Started At</th>
                <th className={th}>Assistant</th>
                <th className={th}>Outcome</th>
                <th className={th}>AHT (s)</th>
                <th className={th}>Score</th>
                <th className={th}>Transcript</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.provider_session_id}>
                  <td className={td}>{new Date(r.started_at).toLocaleString()}</td>
                  <td className={td}>{r.assistant_name || "-"}</td>
                  <td className={td}>
                    <Badge tone={r.outcome === "resolved" ? "green" : r.outcome ? "yellow" : "gray"}>
                      {r.outcome || "in-progress"}
                    </Badge>
                  </td>
                  <td className={td}>{r.aht_seconds ?? "—"}</td>
                  <td className={td}>
                    <Badge tone={r.scoreTone}>{r.scoreLabel}</Badge>
                    {r.summary && (
                      <div className="text-xs text-gray-600 mt-1 line-clamp-2">{r.summary}</div>
                    )}
                  </td>
                  <td className={td}>
                    {r.transcript_preview ? (
                      <div className="text-xs text-gray-700">
                        <div className="line-clamp-3">{r.transcript_preview}</div>
                        <button
                          className="mt-1 text-blue-600 hover:underline"
                          onClick={() => openDetails(r)}
                        >
                          View details
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="px-3 py-8 text-center text-gray-500 text-sm" colSpan={6}>
                    No sessions in the last 30 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Top Questions (30 days) */}
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Top Questions (30 days)</h2>
            <button
              className="text-xs text-blue-600 hover:underline"
              onClick={refreshTopQs}
            >
              refresh
            </button>
          </div>
          <ol className="mt-3 space-y-2">
            {topQs.map((q) => (
              <li key={q.question} className="text-sm">
                <span className="text-gray-800">{q.question}</span>
                <span className="ml-2 text-xs text-gray-500">×{q.times}</span>
              </li>
            ))}
            {!topQs.length && <p className="text-sm text-gray-500">No data yet.</p>}
          </ol>
        </div>
      </div>

      {/* Details modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-6">
          <div className="bg-white w-full max-w-4xl rounded-lg shadow-lg overflow-hidden">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Session Details</h3>
                <div className="text-xs text-gray-500">
                  {new Date(detail.started_at).toLocaleString()} • {detail.assistant_name || "Assistant"} • AHT {detail.aht_seconds ?? "—"}s
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={detail.scoreTone}>{detail.scoreLabel}</Badge>
                <button
                  className="text-sm text-gray-500 hover:text-gray-700"
                  onClick={() => setDetail(null)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="px-5 pt-3">
              <div className="flex gap-2 border-b">
                <button
                  className={`px-3 py-2 text-sm ${detailTab === "transcript" ? "border-b-2 border-blue-600 text-blue-700 font-medium" : "text-gray-600"}`}
                  onClick={() => setDetailTab("transcript")}
                >
                  Transcript
                </button>
                <button
                  className={`px-3 py-2 text-sm ${detailTab === "eval" ? "border-b-2 border-blue-600 text-blue-700 font-medium" : "text-gray-600"}`}
                  onClick={() => setDetailTab("eval")}
                >
                  Evaluation
                </button>
              </div>
            </div>

            <div className="p-5 max-h-[70vh] overflow-auto">
              {detailLoading && <div className="text-sm text-gray-500">Loading…</div>}

              {!detailLoading && detailTab === "transcript" && (
                <pre className="whitespace-pre-wrap text-sm text-gray-900">{detailTranscript || "No transcript available."}</pre>
              )}

              {!detailLoading && detailTab === "eval" && (
                <div className="space-y-4">
                  {!detailEval && <div className="text-sm text-gray-500">No evaluation found.</div>}
                  {detailEval && (
                    <>
                      <div className="text-sm text-gray-700">
                        <div className="font-medium mb-1">Overall Score</div>
                        <Badge tone={scoreToneLabel(detailEval.overall_score).tone}>
                          {scoreToneLabel(detailEval.overall_score).label}
                        </Badge>
                      </div>
                      {detailEval.summary && (
                        <div>
                          <div className="text-sm font-medium mb-1">Summary</div>
                          <p className="text-sm text-gray-800">{detailEval.summary}</p>
                        </div>
                      )}
                      {Array.isArray(detailEval.suggestions) && detailEval.suggestions.length > 0 && (
                        <div>
                          <div className="text-sm font-medium mb-2">Suggestions</div>
                          <ul className="list-disc pl-5 space-y-1">
                            {detailEval.suggestions.map((s, i) => (
                              <li key={i} className="text-sm text-gray-800">
                                <span className="font-medium">{s.criterion ? `${s.criterion}: ` : ""}</span>
                                {s.tip || JSON.stringify(s)}
                                {s.impact ? <span className="ml-2 text-xs text-gray-500">({s.impact})</span> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
