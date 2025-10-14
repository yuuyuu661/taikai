import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import multer from 'multer';
import pkg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== 設定 ======
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Use Railway Postgres.');
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 10, ssl: { rejectUnauthorized: false } });

// ====== DB 初期化 ======
async function initDb() {
  await pool.query(`
  CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    team_name TEXT NOT NULL,
    leader_name TEXT NOT NULL,
    leader_icon BYTEA,
    leader_icon_mime TEXT,
    leader_poke1_url TEXT,
    leader_poke2_url TEXT,
    leader_poke3_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    member_name TEXT NOT NULL,
    member_icon BYTEA,
    member_icon_mime TEXT,
    poke1_url TEXT,
    poke2_url TEXT,
    poke3_url TEXT
  );

  CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    round INTEGER NOT NULL,
    slot INTEGER NOT NULL, -- ラウンド内 1 or 2（2試合/ラウンド）
    team_a INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    team_b INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    winner_team_id INTEGER REFERENCES teams(id),
    most_score_team_id INTEGER REFERENCES teams(id),
    most_kills_team_id INTEGER REFERENCES teams(id),
    most_assists_team_id INTEGER REFERENCES teams(id),
    locked BOOLEAN DEFAULT FALSE -- 結果確定（編集ロック）
  );

  CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(round);
  `);
}

// ====== ユーティリティ ======
function requireAdmin(req, res, next) {
  const key = req.header('x-admin-key') || req.query.key;
  if (key !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function chunkInto(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ラウンドロビン（Circle 法）→ 生成順を 2試合ごとに 1ラウンドへ詰め替え
function generateRoundRobin(teamIds) {
  const teams = [...teamIds];
  if (teams.length % 2 === 1) teams.push(null); // Bye 対応
  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  const pairings = [];

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const t1 = teams[i];
      const t2 = teams[n - 1 - i];
      if (t1 != null && t2 != null) pairings.push([t1, t2]);
    }
    // 回転
    const fixed = teams[0];
    const rest = teams.slice(1);
    rest.unshift(rest.pop());
    teams.splice(0, teams.length, fixed, ...rest);
  }
  // 2試合/ラウンドに詰める
  const packed = chunkInto(pairings, 2);
  return packed; // [[ [a,b],[c,d] ], [ [e,f],[g,h] ], ...]
}

// スタンディング計算
async function computeStandings() {
  const { rows: teams } = await pool.query('SELECT id, team_name FROM teams ORDER BY id');
  const map = new Map(teams.map(t => [t.id, { team_id: t.id, team_name: t.team_name, played: 0, win: 0, lose: 0, pts: 0, bonus: 0 }]));
  const { rows: games } = await pool.query('SELECT * FROM matches WHERE winner_team_id IS NOT NULL');
  for (const g of games) {
    const a = map.get(g.team_a);
    const b = map.get(g.team_b);
    if (!a || !b) continue;
    a.played++; b.played++;
    if (g.winner_team_id === a.team_id) {
      a.win++; a.pts += 3; b.lose++; b.pts += 1;
    } else if (g.winner_team_id === b.team_id) {
      b.win++; b.pts += 3; a.lose++; a.pts += 1;
    }
    // ボーナス
    for (const field of ['most_score_team_id','most_kills_team_id','most_assists_team_id']) {
      if (g[field]) {
        const t = map.get(g[field]);
        if (t) { t.pts += 1; t.bonus += 1; }
      }
    }
  }
  return Array.from(map.values()).sort((x,y) => y.pts - x.pts || y.win - x.win || x.team_id - y.team_id);
}

// ====== API ======

// チーム登録（画像は URL 推奨、アイコンはアップロード可）
app.post('/api/teams', upload.fields([
  { name: 'leader_icon', maxCount: 1 },
  { name: 'member_icon_1', maxCount: 1 },
  { name: 'member_icon_2', maxCount: 1 },
  { name: 'member_icon_3', maxCount: 1 },
  { name: 'member_icon_4', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      team_name,
      leader_name,
      leader_poke1_url, leader_poke2_url, leader_poke3_url,
      // 4名分（name, poke*_url）
      member_name_1, m1_poke1_url, m1_poke2_url, m1_poke3_url,
      member_name_2, m2_poke1_url, m2_poke2_url, m2_poke3_url,
      member_name_3, m3_poke1_url, m3_poke2_url, m3_poke3_url,
      member_name_4, m4_poke1_url, m4_poke2_url, m4_poke3_url
    } = req.body;

    if (!team_name || !leader_name) return res.status(400).json({ error: 'team_name and leader_name are required' });

    const leaderFile = (req.files['leader_icon']||[])[0];
    const leaderBuf = leaderFile?.buffer || null;
    const leaderMime = leaderFile?.mimetype || null;

    const teamResult = await pool.query(
      `INSERT INTO teams (team_name, leader_name, leader_icon, leader_icon_mime, leader_poke1_url, leader_poke2_url, leader_poke3_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [team_name, leader_name, leaderBuf, leaderMime, leader_poke1_url||null, leader_poke2_url||null, leader_poke3_url||null]
    );
    const teamId = teamResult.rows[0].id;

    const mems = [
      { name: member_name_1, icon: 'member_icon_1', p1: m1_poke1_url, p2: m1_poke2_url, p3: m1_poke3_url },
      { name: member_name_2, icon: 'member_icon_2', p1: m2_poke1_url, p2: m2_poke2_url, p3: m2_poke3_url },
      { name: member_name_3, icon: 'member_icon_3', p1: m3_poke1_url, p2: m3_poke2_url, p3: m3_poke3_url },
      { name: member_name_4, icon: 'member_icon_4', p1: m4_poke1_url, p2: m4_poke2_url, p3: m4_poke3_url },
    ];

    for (const m of mems) {
      if (!m.name) continue;
      const f = (req.files[m.icon]||[])[0];
      const buf = f?.buffer || null;
      const mime = f?.mimetype || null;
      await pool.query(
        `INSERT INTO team_members (team_id, member_name, member_icon, member_icon_mime, poke1_url, poke2_url, poke3_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [teamId, m.name, buf, mime, m.p1||null, m.p2||null, m.p3||null]
      );
    }

    res.json({ ok: true, team_id: teamId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to create team' });
  }
});

app.get('/api/teams', async (req, res) => {
  const { rows: teams } = await pool.query('SELECT * FROM teams ORDER BY id');
  const { rows: members } = await pool.query('SELECT * FROM team_members ORDER BY id');
  const byTeam = {};
  for (const m of members) {
    byTeam[m.team_id] = byTeam[m.team_id] || [];
    byTeam[m.team_id].push(m);
  }
  res.json(teams.map(t => ({ ...t, members: byTeam[t.id] || [] })));
});

// 画像配信用（DBの BLOB を返す）
app.get('/img/leader/:teamId', async (req, res) => {
  const { rows } = await pool.query('SELECT leader_icon, leader_icon_mime FROM teams WHERE id=$1', [req.params.teamId]);
  if (!rows[0]?.leader_icon) return res.status(404).end();
  res.set('Content-Type', rows[0].leader_icon_mime || 'image/png');
  res.send(rows[0].leader_icon);
});

app.get('/img/member/:memberId', async (req, res) => {
  const { rows } = await pool.query('SELECT member_icon, member_icon_mime FROM team_members WHERE id=$1', [req.params.memberId]);
  if (!rows[0]?.member_icon) return res.status(404).end();
  res.set('Content-Type', rows[0].member_icon_mime || 'image/png');
  res.send(rows[0].member_icon);
});

// スケジュール生成（既存 matches 全削除 → 再生成）
app.post('/api/schedule/generate', requireAdmin, async (req, res) => {
  try {
    const { rows: teams } = await pool.query('SELECT id FROM teams ORDER BY id');
    const ids = teams.map(t => t.id);
    if (ids.length < 2) return res.status(400).json({ error: 'need at least 2 teams' });

    const packed = generateRoundRobin(ids);

    await pool.query('BEGIN');
    await pool.query('DELETE FROM matches');

    let round = 1;
    for (const group of packed) {
      let slot = 1;
      for (const [a,b] of group) {
        await pool.query(
          `INSERT INTO matches (round, slot, team_a, team_b) VALUES ($1,$2,$3,$4)`,
          [round, slot, a, b]
        );
        slot++;
      }
      round++;
    }
    await pool.query('COMMIT');

    res.json({ ok: true, rounds: packed.length });
  } catch (e) {
    await pool.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'failed to generate schedule' });
  }
});

// 対戦表取得（ラウンドごとに 2 試合）
app.get('/api/schedule', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT m.*, a.team_name AS team_a_name, b.team_name AS team_b_name
    FROM matches m
    LEFT JOIN teams a ON a.id = m.team_a
    LEFT JOIN teams b ON b.id = m.team_b
    ORDER BY round ASC, slot ASC, id ASC
  `);
  const grouped = {};
  for (const r of rows) {
    grouped[r.round] = grouped[r.round] || [];
    grouped[r.round].push(r);
  }
  res.json(grouped);
});

// 結果入力（勝者 + 3部門）
app.post('/api/match/:id/result', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { winner_team_id, most_score_team_id, most_kills_team_id, most_assists_team_id } = req.body;

    const { rows } = await pool.query('SELECT * FROM matches WHERE id=$1', [id]);
    const m = rows[0];
    if (!m) return res.status(404).json({ error: 'match not found' });
    if (m.locked) return res.status(400).json({ error: 'locked' });
    if (![m.team_a, m.team_b].includes(Number(winner_team_id))) {
      return res.status(400).json({ error: 'winner must be team_a or team_b' });
    }
    // 3部門は両チームのいずれか（null でも可にしたい場合は条件緩める）
    for (const t of [most_score_team_id, most_kills_team_id, most_assists_team_id]) {
      if (t != null && ![m.team_a, m.team_b].includes(Number(t))) {
        return res.status(400).json({ error: 'award team must be among the two teams' });
      }
    }

    await pool.query(`UPDATE matches
      SET winner_team_id=$1, most_score_team_id=$2, most_kills_team_id=$3, most_assists_team_id=$4, locked=true
      WHERE id=$5`,
      [winner_team_id, most_score_team_id, most_kills_team_id, most_assists_team_id, id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to submit result' });
  }
});

// スタンディング
app.get('/api/standings', async (req, res) => {
  const table = await computeStandings();
  res.json(table);
});

// ====== 静的ファイル（public） ======
app.use(express.static(path.join(__dirname, 'public')));

// ルートで index.html を返却
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 起動
initDb().then(() => {
  app.listen(PORT, () => console.log(`Server on :${PORT}`));
});
