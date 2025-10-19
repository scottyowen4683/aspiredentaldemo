import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Admin() {
  const [stats, setStats] = useState({ total: 0, containment: 0, aht: 0 });
  const [rows, setRows] = useState([]);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // 1) recent sessions
      const { data: sessions, error: sErr } = await supabase
        .from("sessions")
        .select("id,provider_session_id,started_at,ended_at,outcome,containment,aht_seconds")
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(50);
      if (sErr || !sessions) return;

      // 2) evals for those sessions
      const sessionIds = sessions.map((s) => s.id);
      let evalsBySession = {};
      if (sessionIds.length) {
        const { data: evals } = await supabase
          .from("eval_runs")
          .select("session_id,overall_score,status,summary")
          .in("session_id", sessionIds);
        (evals || []).forEach((e) => {
          evalsBySession[e.session_id] = e;
        });
      }

      // helper: compute AHT if not stored
      const computeAht = (s) => {
        if (typeof s.aht_seconds === "number") return s.aht_seconds;
        if (s.started_at && s.ended_at) {
          const start = new Date(s.started_at).getTime();
          const end = new Date(s.ended_at).getTime();
          return Math.max(0, Math.round((end - start) / 1000));
        }
        return null;
      };

      // KPIs
      const total = sessions.length;
      const resolved = sessions.filter((s) => s.outcome === "resolved").length;
      const containment = total ? Math.round((resolved / total) * 100) : 0;
      const aht = total
        ? Math.round(
            sessions.reduce((acc, s) => acc + (computeAht(s) || 0), 0) / total
          )
        : 0;

      // Map display rows
      const mapped = sessions.map((s) => {
        const evalRow = evalsBySession[s.id];
        const ahtVal = computeAht(s);
        const inProgress = !s.outcome && !s.ended_at;

        // Prefer LLM score
        let score =
          typeof evalRow?.overall_score === "number"
            ? Math.round(evalRow.overall_score)
            : null;

        // Fallback heuristic if LLM score missing
        if (score === null) {
          let tmp = 100;
          if (!inProgress && s.outcome !== "resolved") tmp -= 30;
          if ((ahtVal || 0) > 180) tmp -= 10;
          if (s.containment === false) tmp -= 10;
          score = Math.max(0, Math.min(100, tmp));
        }

        // traffic light
        let label = "Excellent",
          color = "bg-green-500";
        if (score < 90 && score >= 60) {
          label = "Good";
          color = "bg-yellow-500";
        } else if (score < 60) {
          label = "Needs Review";
          color = "bg-red-500";
        }

        // summary (first line only)
        const summary =
          (evalRow?.summary || "")
            .split(/\n+/)[0]
            .slice(0, 160) || null;

        return {
          ...s,
          score,
          label,
          color,
          ahtVal,
          inProgress,
          evalStatus: evalRow?.status || (evalRow ? "complete" : null),
          evalSummary: summary,
        };
      });

      setStats({ total, containment, aht });
      setRows(mapped);
    })();
  }, []);

  const fmtSecs = (s) => (s || s === 0 ? Math.round(s) : "–");

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Aspire AI – Admin Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-4 rounded shadow text-center">
          <h2 className="text-gray-500">Total Sessions (24 h)</h2>
          <p className="text-3xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded shadow text-center">
          <h2 className="text-gray-500">Containment %</h2>
          <p className="text-3xl font-bold">{stats.containment}%</p>
        </div>
        <div className="bg-white p-4 rounded shadow text-center">
          <h2 className="text-gray-500">Avg Handle Time (s)</h2>
          <p className="text-3xl font-bold">{stats.aht}</p>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2">Started At</th>
              <th className="p-2">Outcome</th>
              <th className="p-2">AHT (s)</th>
              <th className="p-2 w-64">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.provider_session_id} className="border-b align-top">
                <td className="p-2">{new Date(s.started_at).toLocaleString()}</td>
                <td className="p-2">
                  {s.inProgress ? (
                    <span className="inline-flex px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                      in-progress
                    </span>
                  ) : s.outcome ? (
                    <span
                      className={`inline-flex px-2 py-1 text-xs rounded ${
                        s.outcome === "resolved"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {s.outcome}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                  {s.evalStatus === "pending" && (
                    <span className="ml-2 inline-flex px-2 py-0.5 text-[10px] rounded bg-amber-100 text-amber-700">
                      eval pending
                    </span>
                  )}
                </td>
                <td className="p-2">{fmtSecs(s.ahtVal)}</td>
                <td className="p-2">
                  <div className="flex flex-col gap-1">
                    <span className={`text-white px-2 py-1 rounded text-sm ${s.color}`}>
                      {s.label} ({s.score})
                    </span>
                    {s.evalSummary && (
                      <div className="text-xs text-slate-600">
                        {s.evalSummary}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-4 text-gray-500" colSpan={4}>
                  No sessions in the last 24 hours.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
