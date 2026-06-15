-- Per-player daily streaks for KnowYourCity.
--
-- One row per (city, client_id): an anonymous device's consecutive-day streak in
-- a city. Kept in its OWN table (not derived from `scores`) so a long streak
-- survives the 90-day retention prune that deletes old daily score rows.
--
-- Anonymous and accounts-ready, exactly like `scores`: `client_id` is the
-- localStorage device UUID (no PII) and `user_id` is the reserved NULL seam a
-- future login will adopt. Per-city (mirrors the existing client-side streak),
-- so a player can keep a separate streak in each city.
--
-- The worker advances this on every official daily submission (see updateStreak
-- in leaderboard-lib.mjs): same-day replay = no change, previous-day = +1, any
-- gap = reset to 1; `best` is the all-time high.

CREATE TABLE IF NOT EXISTS streaks (
  city             TEXT    NOT NULL,
  client_id        TEXT    NOT NULL,         -- anonymous device UUID (no PII)
  user_id          TEXT,                     -- reserved for future accounts; NULL now
  current          INTEGER NOT NULL,         -- current consecutive-day streak
  best             INTEGER NOT NULL,         -- all-time best
  last_played_date TEXT    NOT NULL,         -- city-local "YYYY-MM-DD" last counted
  updated_at       INTEGER NOT NULL,         -- epoch ms
  PRIMARY KEY (city, client_id)
);
