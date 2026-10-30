-- Usage stats for `just server-stats`: calls, texts and sessions in recent periods.
-- Timestamps are stored as UTC 'YYYY-MM-DD HH:MM:SS' and call durations in milliseconds.
.mode box
WITH periods(label, since) AS (
  VALUES ('Last 7 days', datetime('now', '-7 days')),
         ('Last 30 days', datetime('now', '-30 days')),
         ('Last 90 days', datetime('now', '-90 days'))
)
SELECT
  label AS period,
  (SELECT count(*) FROM calls WHERE timestamp >= since) AS calls,
  (SELECT round(coalesce(sum(duration), 0) / 3600000.0, 1) FROM calls WHERE timestamp >= since) AS call_hours,
  (SELECT count(*) FROM texts WHERE timestamp >= since) AS texts,
  (SELECT count(DISTINCT session_id) FROM (
     SELECT session_id, timestamp FROM calls UNION ALL SELECT session_id, timestamp FROM texts
   ) WHERE timestamp >= since) AS sessions
FROM periods;
