-- Loyalty redemption catalog and customer requests.
-- Pending requests reserve points; points are deducted only when an admin confirms reward handoff.
CREATE TABLE IF NOT EXISTS point_rewards (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 points_cost INTEGER NOT NULL CHECK(points_cost > 0),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 sort_order INTEGER NOT NULL DEFAULT 100,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_point_rewards_active ON point_rewards(active,sort_order,points_cost);
CREATE TABLE IF NOT EXISTS point_redemptions (
 id TEXT PRIMARY KEY,
 request_key TEXT NOT NULL,
 line_user_id TEXT NOT NULL REFERENCES members(line_user_id),
 reward_id TEXT NOT NULL REFERENCES point_rewards(id),
 reward_name TEXT NOT NULL,
 points_cost INTEGER NOT NULL CHECK(points_cost > 0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 decided_by TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 decided_at TEXT,
 UNIQUE(line_user_id,request_key)
);
CREATE INDEX IF NOT EXISTS idx_point_redemptions_member ON point_redemptions(line_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_redemptions_status ON point_redemptions(status,created_at DESC);
