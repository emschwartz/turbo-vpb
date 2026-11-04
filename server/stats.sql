-- Usage stats for `just server-stats`: calls, texts and sessions in recent periods,
-- then a histogram of calls per week.
-- Timestamps are stored as UTC 'YYYY-MM-DD HH:MM:SS' and call durations in milliseconds.
.mode box
WITH periods(label, since) AS (
  VALUES ('Last 7 days', datetime('now', '-7 days')),
         ('Last 30 days', datetime('now', '-30 days')),
         ('Last 90 days', datetime('now', '-90 days')),
         ('Last 180 days', datetime('now', '-180 days')),
         ('Last 365 days', datetime('now', '-365 days'))
)
SELECT
  label AS "Period",
  (SELECT count(*) FROM calls WHERE timestamp >= since) AS "Calls",
  (SELECT round(coalesce(sum(duration), 0) / 3600000.0, 1) FROM calls WHERE timestamp >= since) AS "Call hours",
  (SELECT count(*) FROM texts WHERE timestamp >= since) AS "Texts",
  (SELECT count(DISTINCT session_id) FROM (
     SELECT session_id, timestamp FROM calls UNION ALL SELECT session_id, timestamp FROM texts
   ) WHERE timestamp >= since) AS "Sessions"
FROM periods;

-- Weeks (Monday to Sunday, UTC) back to the first call, or for the last year if
-- the calls go back further, including weeks with no calls.
WITH RECURSIVE first_week(week) AS (
  SELECT max(
    coalesce((SELECT date(min(timestamp), 'weekday 0', '-6 days') FROM calls), date('now', 'weekday 0', '-6 days')),
    date('now', 'weekday 0', '-6 days', '-364 days')
  )
),
weeks(week) AS (
  SELECT date('now', 'weekday 0', '-6 days')
  UNION ALL
  SELECT date(weeks.week, '-7 days') FROM weeks, first_week WHERE weeks.week > first_week.week
),
counts AS (
  SELECT week, (SELECT count(*) FROM calls WHERE timestamp >= week AND timestamp < date(week, '+7 days')) AS calls
  FROM weeks
)
SELECT
  week || iif(week = date('now', 'weekday 0', '-6 days'), ' (so far)', '') AS "Week of",
  calls AS "Calls",
  -- Scaled to 40 wide, rounding up so any week with calls gets a visible bar
  replace(printf('%*s', (calls * 40 + peak - 1) / peak, ''), ' ', '█') AS "Histogram"
FROM counts, (SELECT max(max(calls), 1) AS peak FROM counts)
ORDER BY week;
