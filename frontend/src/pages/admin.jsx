import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function Badge({ color = "slate", children }) {
  const map = {
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    red: "bg-red-100 text-red-700",
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${map[color]}`}>{children}</span>;
}

function ScorePill({ score }) {
  let label = "Excellent", color = "green";
  if (score < 90 && score >= 60) { label = "Good"; color = "yellow"; }
  else if (score < 60) { label = "Needs Review"; color = "red"; }
  return <Badge color={color}>{label} ({Math.max(0, Math.min(100, Math.round(score)))})</Badge>;
}

export default function Admin() {
  const [stats, setStats] = useState({ total: 0, containment: 0, aht: 0 });
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null); // for modal

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Pull sessions joined with assistants & clients if available
      const { data: sessionsData, error } = await supabase
        .from("sessions")
        .select(`*,
                 assistant:assistant_id ( name ),
                 client:client_id ( name ),
                 eval:eval_runs!eval_runs_session_id_fkey( overall_score, summary, suggestions, status )`)
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(100);

      if (error) { console.error(error); return; }
      const sessions = sessionsData || [];

      // KPIs
      const total = sessions.length;
      const resolved = sessions.filter(s => s.outcome === "resolved").length;
      const containment = total ? Math.round((resolved / total) * 100) : 0;

      const ahtVals = sessions.map(s => s.aht_seconds).filter(v => typeof v === "number" && v > 0);
      const aht = ahtVals.length ? Math.round(ahtVals.reduce((a,b)=>a+b,0) / ahtVals.length) : 0;

      setStats({ total, containment, aht });

      // normalize rows with score
      const list = sessions.map(s => {
        const score = typeof s.eval?.overall_score === "number" ? s.eval.overall_score : null;
        let scorePill = null;
        if (score !== null) scorePill = <ScorePill score={score} />;
        else if (s.eval?.status === "pending") scorePill = <Badge color="yellow">eval pending</Badge>;
        else scorePill = <Badge>—</Badge>;

        return {
          id: s.provider_session_id,
          started_at: s.started_at,
          outcome: s.outcome || "in-progress",
          aht: s.aht_seconds || 0,
          client: s.client?.name || "—",
          assistant: s.assistant?.name || "—",
          score,
          scorePill,
          details: {
            summary: s.eval?.summary || "",
            suggestions: Array.isArray(s.eval?.suggestions) ? s.eval.suggestions : [],
          }
        };
      });

      setRows(list);
    })();
  }, []);

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Aspire AI — Admin Dashboard</h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl shadow">
          <div className="text-slate-500">Total Sessions (24 h)</div>
          <div className="text-4xl font-bold mt-1">{stats.total}</div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow">
          <div className="text-slate-500">Containment %</div>
          <div className="text-4xl font-bold mt-1">{stats.containment}%</div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow">
          <div className="text-slate-500">Avg Handle Time (s)</div>
          <div className="text-4xl font-bold mt-1">{stats.aht}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="p-3">Started At</th>
              <th className="p-3">Client</th>
              <th className="p-3">Assistant</th>
              <th className="p-3">Outcome</th>
              <th className="p-3">AHT (s)</th>
              <th className="p-3">Score</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="p-3">{new Date(r.started_at).toLocaleString()}</td>
                <td className="p-3">{r.client}</td>
                <td className="p-3">{r.assistant}</td>
                <td className="p-3">
                  {r.outcome === "resolved" && <Badge color="green">resolved</Badge>}
                  {r.outcome === "abandoned" && <Badge color="red">abandoned</Badge>}
                  {r.outcome === "in-progress" && <Badge color="blue">in-progress</Badge>}
                </td>
                <td className="p-3">{r.aht}</td>
                <td className="p-3">{r.scorePill}</td>
                <td className="p-3">
                  <button
                    onClick={() => setDetail({ id: r.id, ...r.details })}
                    className="text-sm px-3 py-1 rounded bg-slate-900 text-white hover:bg-slate-800"
                  >
                    View details
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-6 text-slate-500" colSpan={7}>No sessions in the last 24 hours.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Session details</h2>
              <button onClick={() => setDetail(null)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="space-y-4 max-h-[70vh] overflow-auto">
              {detail.summary && (
                <section>
                  <h3 className="font-medium text-slate-700">Summary</h3>
                  <p className="mt-1 text-slate-800 whitespace-pre-wrap">{detail.summary}</p>
                </section>
              )}
              {detail.suggestions?.length > 0 && (
                <section>
                  <h3 className="font-medium text-slate-700">Suggestions</h3>
                  <ul className="mt-2 list-disc pl-5 space-y-1">
                    {detail.suggestions.map((s, i) => (
                      <li key={i} className="text-slate-800">
                        {typeof s === "string" ? s : `${s.criterion ? `${s.criterion}: ` : ""}${s.tip || JSON.stringify(s)}`}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {!detail.summary && (!detail.suggestions || detail.suggestions.length === 0) && (
                <p className="text-slate-600">No evaluator details for this session yet.</p>
              )}
            </div>
            <div className="mt-6 text-right">
              <button onClick={() => setDetail(null)} className="px-4 py-2 rounded bg-slate-900 text-white">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
