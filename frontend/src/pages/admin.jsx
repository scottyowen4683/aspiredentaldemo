// frontend/src/pages/admin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

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
  const [sinceDays] = useState(30);
  const [rows, setRows] = useState([]);
  const [topQs, setTopQs] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState("transcript");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTranscript, setDetailTranscript] = useState("");
  const [detailEval, setDetailEval] = useState(null);
  const [assistantFilter, setAssistantFilter] = useState("all");

  const [stats, setStats] = useState({ total: 0, containment: 0, aht: 0 });

  useEffect(() => {
    async function load() {
      const sinceISO = new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString();

      // Load sessions
      let query = supabase
        .from("admin_sessions_recent")
        .select("*")
        .gte("started_at", sinceISO)
        .order("started_at", { ascending: false })
        .limit(200);

      const { data: recent, error } = await query;
      if (error) {
        console.error("admin_sessions_recent error", error);
        return;
      }

      const total = recent.length;
      const resolved = recent.filter((r) => r.outcome === "resolved").length;
      const containment = total ? Math.round((resolved / total) * 100) : 0;
      const aht = total && recent.some((r) => r.aht_seconds != null)
        ? Math.round(recent.reduce((acc, r) => acc + (r.aht_seconds || 0), 0) / total)
        : 0;

      const graded = recent.map((r) => {
        const score =
          typeof r.overall_score === "number"
            ? Math.max(0, Math.min(100, Math.round(r.overall_score)))
            : r.outcome === "resolved"
            ? 100
            : 0;
        const { tone, label } = scoreToneLabel(score);
        return { ...r, score, scoreTone: tone, scoreLabel: label };
      });

      setRows(graded);
      setStats({ total, containment, aht });

      const { data: qdata } = await supabase
        .from("top_questions_30d")
        .select("*")
        .order("times", { ascending: false })
        .limit(12);
      if (qdata) setTopQs(qdata);
    }
    load();
  }, [sinceDays]);

  const assistantOptions = useMemo(() => {
    const uniq = Array.from(new Set(rows.map((r) => r.assistant_id).filter(Boolean)));
    return uniq;
  }, [rows]);

  const filteredRows = useMemo(() => {
    return assistantFilter === "all"
      ? rows
      : rows.filter((r) => r.assistant_id === assistantFilter);
  }, [rows, assistantFilter]);

  async function refreshTopQs() {
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
      assistant_id: row.assistant_id,
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
      const { data: art } = await supabase
        .from("session_artifacts")
        .select("transcript_full")
        .eq("session_id", row.provider_session_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (art?.transcript_full) setDetailTranscript(art.transcript_full);

      const { data: evals } = await supabase
        .from("eval_runs")
        .select("overall_score, summary, suggestions, status, completed_at")
        .eq("session_id", row.provider_session_id)
        .order("completed_at", { ascending: false })
        .limit(1);
      if (evals && evals[0]) setDetailEval(evals[0]);
    } catch (e) {
      console.error("detail load error", e);
    } finally {
      setDetailLoading(false);
    }
  }

  async function deleteSession(sessionId) {
    if (!window.confirm("Delete this session and its artifacts/evals?")) return;
    // cascade via FK
    await supabase.from("sessions").delete().eq("provider_session_id", sessionId);
    setRows((r) => r.filter((x) => x.provider_session_id !== sessionId));
    setDetail(null);
  }

  const td = "px-3 py-3 align-top border-b border-gray-100 text-sm";
  const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b";

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-xl font-bold mb-6">Aspire AI — Admin Dashboard</h1>

      {/* Filters + KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-gray-500 text-sm mb-1">Assistant</div>
          <select
            value={assistantFilter}
            onChange={(e) => setAssistantFilter(e.target.value)}
            className="border rounded px-2 py-1 w-full"
          >
            <option value="all">All</option>
            {assistantOptions.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
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
                <th className={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.provider_session_id}>
                  <td className={td}>{new Date(r.started_at).toLocaleString()}</td>
                  <td className={td}>
                    <div className="text-sm text-gray-800">{r.assistant_name || "Assistant"}</div>
                    <div className="text-xs text-gray-500">{r.assistant_id || "—"}</div>
                  </td>
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
                  <td className={td}>
                    <button
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => deleteSession(r.provider_session_id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredRows.length && (
                <tr>
                  <td className="px-3 py-8 text-center text-gray-500 text-sm" colSpan={7}>
                    No sessions in the last {sinceDays} days.
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
                <pre className="whitespace-pre-wrap text-sm text-gray-900">
                  {detailTranscript || "No transcript available."}
                </pre>
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

            <div className="px-5 py-3 border-t flex items-center justify-between">
              <div className="text-xs text-gray-500">
                Assistant: {detail.assistant_id || "—"}
              </div>
              <button
                className="text-xs text-red-600 hover:underline"
                onClick={() => deleteSession(detail.provider_session_id)}
              >
                Delete Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
