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
  const [assistantFilter, setAssistantFilter] = useState("all");
  const [stats, setStats] = useState({ total: 0, containment: 0, aht: 0 });

  const [topQs, setTopQs] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState("transcript");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTranscript, setDetailTranscript] = useState("");
  const [detailEval, setDetailEval] = useState(null);

  // ---- load grid -----------------------------------------------------------
  useEffect(() => {
    async function load() {
      const sinceISO = new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString();

      const { data, error } = await supabase
        .from("calls_dashboard")
        .select("*")
        .gte("started_at", sinceISO)
        .order("started_at", { ascending: false })
        .limit(200);

      if (error) {
        console.error("calls_dashboard error", error);
        setRows([]);
        setStats({ total: 0, containment: 0, aht: 0 });
        return;
      }

      // enrich with score tone/label
      const enriched = (data || []).map((r) => {
        const { tone, label } = scoreToneLabel(typeof r.score === "number" ? r.score : undefined);
        return { ...r, scoreTone: tone, scoreLabel: label };
      });
      setRows(enriched);

      // KPIs
      const total = enriched.length;
      const aht =
        total && enriched.some((r) => typeof r.aht_seconds === "number")
          ? Math.round(
              enriched.reduce((acc, r) => acc + (r.aht_seconds || 0), 0) / total
            )
          : 0;

      // containment proxy: percent of ended calls with score >= 70
      const ended = enriched.filter((r) => r.ended_at != null);
      const good = ended.filter((r) => (r.score || 0) >= 70);
      const containment = ended.length ? Math.round((good.length / ended.length) * 100) : 0;

      setStats({ total, containment, aht });

      // optional "Top Questions" if you keep your existing view
      const tq = await supabase
        .from("top_questions_30d")
        .select("*")
        .order("times", { ascending: false })
        .limit(12);
      if (!tq.error && tq.data) setTopQs(tq.data);
    }
    load();
  }, [sinceDays]);

  // assistant list from data
  const assistantOptions = useMemo(() => {
    const uniq = Array.from(new Set(rows.map((r) => r.assistant).filter(Boolean)));
    return uniq;
  }, [rows]);

  const filteredRows = useMemo(() => {
    return assistantFilter === "all" ? rows : rows.filter((r) => r.assistant === assistantFilter);
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

  // ---- detail modal --------------------------------------------------------
  async function openDetails(row) {
    setDetail({
      id: row.id,
      started_at: row.started_at,
      ended_at: row.ended_at,
      aht_seconds: row.aht_seconds,
      assistant: row.assistant || "Assistant",
      score: row.score,
      scoreTone: row.scoreTone,
      scoreLabel: row.scoreLabel,
    });
    setDetailLoading(true);
    setDetailTab("transcript");
    setDetailTranscript("");
    setDetailEval(null);
    try {
      const { data: tx } = await supabase
        .from("transcripts")
        .select("full_transcript")
        .eq("call_id", row.id)
        .maybeSingle();
      if (tx?.full_transcript) setDetailTranscript(tx.full_transcript);

      const { data: callRow } = await supabase
        .from("calls")
        .select("rubric_json")
        .eq("id", row.id)
        .maybeSingle();
      if (callRow?.rubric_json) setDetailEval(callRow.rubric_json);
    } catch (e) {
      console.error("detail load error", e);
    } finally {
      setDetailLoading(false);
    }
  }

  async function deleteCall(callId) {
    if (!window.confirm("Delete this call and its transcript?")) return;
    await supabase.from("calls").delete().eq("id", callId);
    setRows((r) => r.filter((x) => x.id !== callId));
    setDetail(null);
  }

  // optional: let an admin trigger scoring again
  async function reScore(callId) {
    try {
      const url = `/.netlify/functions/eval-runner?callId=${encodeURIComponent(callId)}`;
      await fetch(url).catch(() => {});
      // soft refresh of the one row
      const { data } = await supabase.from("calls").select("score, rubric_json, transcript_preview").eq("id", callId).maybeSingle();
      if (data) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === callId
              ? {
                  ...r,
                  score: data.score,
                  transcript_preview: data.transcript_preview,
                  ...scoreToneLabelFields(data.score),
                }
              : r
          )
        );
        setDetailEval(data.rubric_json || null);
      }
    } catch (e) {
      console.error("reScore error", e);
    }
  }

  function scoreToneLabelFields(score) {
    const { tone, label } = scoreToneLabel(typeof score === "number" ? score : undefined);
    return { scoreTone: tone, scoreLabel: label };
  }

  // table cell styles
  const td = "px-3 py-3 align-top border-b border-gray-100 text-sm";
  const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b";

  return (
    <div className="page-container bg-gray-50 min-h-screen">
      <h1 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-center sm:text-left">
        Aspire AI — Admin Dashboard
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-3 sm:p-5 text-center sm:text-left">
          <div className="text-gray-500 text-xs sm:text-sm">Total Sessions (30 days)</div>
          <div className="text-xl sm:text-3xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-3 sm:p-5 text-center sm:text-left">
          <div className="text-gray-500 text-xs sm:text-sm">Containment %</div>
          <div className="text-xl sm:text-3xl font-bold">{stats.containment}%</div>
        </div>
        <div className="bg-white rounded-lg shadow p-3 sm:p-5 text-center sm:text-left">
          <div className="text-gray-500 text-xs sm:text-sm">Avg Handle Time (s)</div>
          <div className="text-xl sm:text-3xl font-bold">{stats.aht}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-3 sm:p-5">
          <div className="text-gray-500 text-xs sm:text-sm mb-1">Assistant</div>
          <select
            value={assistantFilter}
            onChange={(e) => setAssistantFilter(e.target.value)}
            className="border rounded px-2 py-1 w-full text-sm"
          >
            <option value="all">All</option>
            {assistantOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sessions table */}
        <div className="lg:col-span-3 bg-white rounded-lg shadow overflow-hidden">
          <div className="responsive-table">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>Started</th>
                  <th className={th}>Assistant</th>
                  <th className={th}>AHT (s)</th>
                  <th className={th}>Score</th>
                  <th className={th}>Transcript</th>
                  <th className={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className={td}>{new Date(r.started_at).toLocaleString()}</td>
                    <td className={td}>
                      <div className="text-sm text-gray-800">{r.assistant || "Assistant"}</div>
                    </td>
                    <td className={td}>{typeof r.aht_seconds === "number" ? r.aht_seconds : "—"}</td>
                    <td className={td}>
                      <Badge tone={r.scoreTone}>{r.scoreLabel}</Badge>
                    </td>
                    <td className={td}>
                      {r.transcript_preview ? (
                        <div className="text-xs text-gray-700">
                          <div className="line-clamp-2">{r.transcript_preview}</div>
                          <button
                            className="mt-1 text-blue-600 hover:underline text-xs"
                            onClick={() => openDetails(r)}
                          >
                            View
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <button
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => reScore(r.id)}
                          title="Re-run evaluation"
                        >
                          Score now
                        </button>
                        <button
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => deleteCall(r.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredRows.length && (
                  <tr>
                    <td className="px-3 py-8 text-center text-gray-500 text-sm" colSpan={6}>
                      No sessions in the last {sinceDays} days.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Questions */}
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm sm:text-base">Top Questions (30 days)</h2>
            <button className="text-xs text-blue-600 hover:underline" onClick={refreshTopQs}>
              refresh
            </button>
          </div>
          <ol className="space-y-2">
            {topQs.map((q) => (
              <li key={q.question} className="text-xs sm:text-sm">
                <span className="text-gray-800">{q.question}</span>
                <span className="ml-2 text-xs text-gray-500">×{q.times}</span>
              </li>
            ))}
            {!topQs.length && <p className="text-xs text-gray-500">No data yet.</p>}
          </ol>
        </div>
      </div>

      {/* Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-2 sm:p-6 overflow-auto">
          <div className="bg-white w-full max-w-4xl rounded-lg shadow-lg overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm sm:text-base">Call Details</h3>
                <div className="text-xs text-gray-500">
                  {new Date(detail.started_at).toLocaleString()} • {detail.assistant} • AHT{" "}
                  {detail.aht_seconds ?? "—"}s
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={detail.scoreTone}>{detail.scoreLabel}</Badge>
                <button className="text-xs sm:text-sm text-gray-500 hover:text-gray-700" onClick={() => setDetail(null)}>
                  Close
                </button>
              </div>
            </div>

            <div className="px-4 sm:px-5 pt-3 flex gap-2 border-b text-xs sm:text-sm">
              <button
                className={`px-2 sm:px-3 py-2 ${
                  detailTab === "transcript" ? "border-b-2 border-blue-600 text-blue-700 font-medium" : "text-gray-600"
                }`}
                onClick={() => setDetailTab("transcript")}
              >
                Transcript
              </button>
              <button
                className={`px-2 sm:px-3 py-2 ${
                  detailTab === "eval" ? "border-b-2 border-blue-600 text-blue-700 font-medium" : "text-gray-600"
                }`}
                onClick={() => setDetailTab("eval")}
              >
                Evaluation
              </button>
            </div>

            <div className="p-4 sm:p-5 max-h-[75vh] overflow-auto text-sm">
              {detailLoading && <div className="text-gray-500">Loading…</div>}

              {!detailLoading && detailTab === "transcript" && (
                <pre className="whitespace-pre-wrap text-gray-900 break-words">
                  {detailTranscript || "No transcript available."}
                </pre>
              )}

              {!detailLoading && detailTab === "eval" && (
                <div className="space-y-3">
                  {!detailEval && <div className="text-gray-500">No evaluation found.</div>}
                  {detailEval && (
                    <>
                      <div className="font-medium">Breakdown</div>
                      <ul className="list-disc pl-4 space-y-1">
                        {Object.entries(detailEval.breakdown || {}).map(([k, v]) => (
                          <li key={k} className="text-sm">
                            <span className="capitalize">{k}</span>: <strong>{v}</strong>
                          </li>
                        ))}
                      </ul>
                      {detailEval.notes && (
                        <div>
                          <div className="font-medium mb-1">Notes</div>
                          <p>{detailEval.notes}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="px-4 sm:px-5 py-3 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs sm:text-sm">
              <div className="text-gray-500">ID: {detail.id}</div>
              <div className="flex items-center gap-4">
                <button className="text-blue-600 hover:underline" onClick={() => reScore(detail.id)}>
                  Score now
                </button>
                <button className="text-red-600 hover:underline" onClick={() => deleteCall(detail.id)}>
                  Delete Call
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
