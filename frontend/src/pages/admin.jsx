import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Admin() {
  const [stats, setStats] = useState({ total: 0, containment: 0, aht: 0 });
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    async function loadData() {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: sessionsData } = await supabase
        .from("sessions")
        .select("*")
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(50);

      if (!sessionsData) return;

      // --- KPI calc ---
      const total = sessionsData.length;
      const resolved = sessionsData.filter((s) => s.outcome === "resolved");
      const containment = total ? Math.round((resolved.length / total) * 100) : 0;
      const aht =
        total && sessionsData.some((s) => s.aht_seconds)
          ? Math.round(
              sessionsData.reduce((a, b) => a + (b.aht_seconds || 0), 0) / total
            )
          : 0;

      // --- scoring heuristic ---
      const scored = sessionsData.map((s) => {
        let score = 100;
        if (s.outcome !== "resolved") score -= 30;
        if (s.aht_seconds > 180) score -= 10;
        if (s.containment === false) score -= 10;
        if (score > 100) score = 100;
        if (score < 0) score = 0;
        let label = "Excellent",
          color = "bg-green-500";
        if (score < 90 && score >= 60) {
          label = "Good";
          color = "bg-yellow-500";
        } else if (score < 60) {
          label = "Needs Review";
          color = "bg-red-500";
        }
        return { ...s, score, label, color };
      });

      setStats({ total, containment, aht });
      setSessions(scored);
    }
    loadData();
  }, []);

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
              <th className="p-2">Score</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.provider_session_id} className="border-b">
                <td className="p-2">
                  {new Date(s.started_at).toLocaleString()}
                </td>
                <td className="p-2">{s.outcome || "-"}</td>
                <td className="p-2">{s.aht_seconds || "-"}</td>
                <td className="p-2">
                  <span
                    className={`text-white px-2 py-1 rounded text-sm ${s.color}`}
                  >
                    {s.label} ({s.score})
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
