CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(6) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'lobby',
  circuit_data JSONB,
  current_turn INT DEFAULT 0,
  current_player_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name VARCHAR(30) NOT NULL,
  color VARCHAR(7) NOT NULL,
  skin VARCHAR(50) DEFAULT 'default',
  trail VARCHAR(50) DEFAULT 'default',
  position_x INT DEFAULT 0,
  position_y INT DEFAULT 0,
  velocity_x INT DEFAULT 0,
  velocity_y INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'alive',
  finish_position INT,
  skip_count INT DEFAULT 0,
  crash_turns_left INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  turn INT NOT NULL,
  accel_x INT NOT NULL,
  accel_y INT NOT NULL,
  new_position_x INT NOT NULL,
  new_position_y INT NOT NULL,
  crashed BOOLEAN DEFAULT FALSE,
  auto_skip BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  name VARCHAR(30) NOT NULL,
  xp INT DEFAULT 0,
  coins INT DEFAULT 0,
  rank VARCHAR(30) DEFAULT 'Karting',
  games_played INT DEFAULT 0,
  games_won INT DEFAULT 0,
  owned_skins JSONB DEFAULT '[]'::jsonb,
  owned_trails JSONB DEFAULT '[]'::jsonb,
  owned_themes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE moves;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE games;

-- RLS (permissive for now — anonymous auth)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Games readable" ON games FOR SELECT USING (true);
CREATE POLICY "Games insertable" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "Games updatable" ON games FOR UPDATE USING (true);
CREATE POLICY "Players readable" ON players FOR SELECT USING (true);
CREATE POLICY "Players insertable" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Players updatable" ON players FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Moves readable" ON moves FOR SELECT USING (true);
CREATE POLICY "Moves insertable" ON moves FOR INSERT WITH CHECK (true);
CREATE POLICY "Profiles readable" ON profiles FOR SELECT USING (true);
CREATE POLICY "Profiles insertable" ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "Profiles updatable" ON profiles FOR UPDATE USING (id = auth.uid());

CREATE INDEX idx_games_code ON games(code) WHERE status != 'finished';
CREATE INDEX idx_players_game ON players(game_id);
CREATE INDEX idx_moves_game ON moves(game_id);
