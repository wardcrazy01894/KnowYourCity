-- Daily leaderboard storage for KnowYourCity.
--
-- One row per (city, date, client_id): an anonymous device's best score for a
-- given city on a given city-local day. `city` is part of the PRIMARY KEY (not
-- just a filtered column) so leaderboards are independent BY CONSTRUCTION — a
-- 500 in State College can never be ranked against a 415 in St. Pete.
--
-- `client_id` is an anonymous random UUID minted in the browser's localStorage
-- (no PII). `user_id` is the reserved seam for FUTURE accounts: it is NULL today
-- and will be backfilled when a logged-in player links their device. (Note: that
-- migration is inherently lossy — a player who cleared localStorage has no
-- client_id to link, so pre-account history can't always be reattached. This is
-- the accepted tradeoff of an anonymous-first design.)
--
-- The rank query is `COUNT(*) WHERE city=? AND date=? AND score > ?`, served by
-- idx_scores_rank below.

CREATE TABLE IF NOT EXISTS scores (
  city       TEXT    NOT NULL,
  date       TEXT    NOT NULL,            -- city-local calendar day, "YYYY-MM-DD"
  client_id  TEXT    NOT NULL,            -- anonymous device UUID (no PII)
  score      INTEGER NOT NULL,            -- daily total, 0..500
  user_id    TEXT,                        -- reserved for future accounts; NULL now
  created_at INTEGER NOT NULL,            -- epoch ms, first submission
  updated_at INTEGER NOT NULL,            -- epoch ms, last (keep-max) update
  PRIMARY KEY (city, date, client_id)
);

-- Covers both the rank count (city, date, score > ?) and the total count
-- (city, date). Leading (city, date) makes per-day, per-city scans cheap.
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (city, date, score);
