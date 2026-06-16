-- Add `lineup` to the scores primary key so one device can hold MORE THAN ONE
-- entry for a (city, date).
--
-- Why: the official daily set can change under a player mid-day (a venue
-- removed, an override edited). When it does they're allowed to replay the new
-- set, and that genuine second completion deserves its own leaderboard row.
-- `lineup` is a short hash of the day's location ids (client progress.ts:
-- lineupHash). The day's board for a (city, date) is the UNION of all rows, so
-- both entries show; keep-max is per-lineup, so a reload of the same completion
-- still can't create a duplicate or lower a stored score.
--
-- SQLite can't alter a PRIMARY KEY in place, so rebuild the table. Existing rows
-- predate lineups and get the empty-string '' legacy bucket (matching the
-- worker's default for old clients that don't send a lineup).

CREATE TABLE scores_new (
  city       TEXT    NOT NULL,
  date       TEXT    NOT NULL,            -- city-local calendar day, "YYYY-MM-DD"
  client_id  TEXT    NOT NULL,            -- anonymous device UUID (no PII)
  lineup     TEXT    NOT NULL DEFAULT '', -- hash of the played set ('' = legacy)
  score      INTEGER NOT NULL,            -- daily total, 0..500
  user_id    TEXT,                        -- reserved for future accounts; NULL now
  created_at INTEGER NOT NULL,            -- epoch ms, first submission
  updated_at INTEGER NOT NULL,            -- epoch ms, last (keep-max) update
  PRIMARY KEY (city, date, client_id, lineup)
);

INSERT INTO scores_new (city, date, client_id, lineup, score, user_id, created_at, updated_at)
  SELECT city, date, client_id, '', score, user_id, created_at, updated_at FROM scores;

DROP TABLE scores;
ALTER TABLE scores_new RENAME TO scores;

-- Recreate the rank/total index (city, date, score) — unchanged shape.
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (city, date, score);
