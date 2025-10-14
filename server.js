import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import multer from 'multer';
import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) console.error('ERROR: DATABASE_URL is not set.');
const pool = new Pool({ connectionString: DATABASE_URL, max: 10, ssl: { rejectUnauthorized: false } });

// static files
app.use(express.static(path.join(__dirname, 'public')));

// DB init
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
    slot INTEGER NOT NULL,
    team_a INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    team_b INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    winner_team_id INTEGER REFERENCES teams(id),
    most_score_team_id INTEGER REFERENCES teams(id),
    most_kills_team_id INTEGER REFERENCES teams(id),
    most_assists_team_id INTEGER REFERENCES teams(id),
    locked BOOLEAN DEFAULT FALSE
  );
  CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(round);
  `);
}

// utils
function requireAdmin(req,res,next){ const k=req.header('x-admin-key')||req.query.key; if(k!==ADMIN_PASSWORD) return res.status(401).json({error:'Unauthorized'}); next(); }
function chunkInto(a,n){const r=[];for(let i=0;i<a.length;i+=n)r.push(a.slice(i,i+n));return r;}
function generateRoundRobin(ids){
  const t=[...ids]; if(t.length%2===1) t.push(null);
  const n=t.length, half=n/2, rounds=n-1, pairs=[];
  for(let r=0;r<rounds;r++){
    for(let i=0;i<half;i++){ const a=t[i], b=t[n-1-i]; if(a!=null&&b!=null) pairs.push([a,b]); }
    const fixed=t[0], rest=t.slice(1); rest.unshift(rest.pop()); t.splice(0,t.length,fixed,...rest);
  }
  return chunkInto(pairs,2);
}
async function computeStandings(){
  const { rows: teams } = await pool.query('SELECT id, team_name FROM teams ORDER BY id');
  const map = new Map(teams.map(t=>[t.id,{team_id:t.id,team_name:t.team_name,played:0,win:0,lose:0,pts:0,bonus:0}]));
  const { rows: games } = await pool.query('SELECT * FROM matches WHERE winner_team_id IS NOT NULL');
  for(const g of games){
    const a=map.get(g.team_a), b=map.get(g.team_b); if(!a||!b) continue;
    a.played++; b.played++;
    if(g.winner_team_id===a.team_id){ a.win++; a.pts+=3; b.lose++; b.pts+=1; }
    else if(g.winner_team_id===b.team_id){ b.win++; b.pts+=3; a.lose++; a.pts+=1; }
    for(const f of ['most_score_team_id','most_kills_team_id','most_assists_team_id']){ if(g[f]){ const t=map.get(g[f]); if(t){ t.pts++; t.bonus++; } } }
  }
  return Array.from(map.values()).sort((x,y)=> y.pts-x.pts || y.win-x.win || x.team_id-y.team_id);
}

// endpoints
app.get('/api/images', (req,res)=>{
  try{
    const dir=path.join(__dirname,'public','images');
    const files = fs.existsSync(dir)? fs.readdirSync(dir).filter(f=>/\.(png|jpe?g|gif|webp|svg)$/i.test(f)) : [];
    res.json(files.map(f=>`/images/${f}`));
  }catch(e){ console.error(e); res.json([]); }
});

app.post('/api/teams', requireAdmin, upload.fields([
  {name:'leader_icon',maxCount:1},
  {name:'member_icon_1',maxCount:1},
  {name:'member_icon_2',maxCount:1},
  {name:'member_icon_3',maxCount:1},
  {name:'member_icon_4',maxCount:1},
]), async (req,res)=>{
  try{
    const { team_name, leader_name, leader_poke1_url, leader_poke2_url, leader_poke3_url,
      member_name_1, m1_poke1_url, m1_poke2_url, m1_poke3_url,
      member_name_2, m2_poke1_url, m2_poke2_url, m2_poke3_url,
      member_name_3, m3_poke1_url, m3_poke2_url, m3_poke3_url,
      member_name_4, m4_poke1_url, m4_poke2_url, m4_poke3_url } = req.body;
    if(!team_name||!leader_name) return res.status(400).json({error:'team_name and leader_name are required'});
    const lf=(req.files['leader_icon']||[])[0];
    const team = await pool.query(
      `INSERT INTO teams(team_name,leader_name,leader_icon,leader_icon_mime,leader_poke1_url,leader_poke2_url,leader_poke3_url)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [team_name, leader_name, lf?.buffer||null, lf?.mimetype||null, leader_poke1_url||null, leader_poke2_url||null, leader_poke3_url||null]
    );
    const id = team.rows[0].id;
    const mems=[
      {n:1,name:member_name_1,p1:m1_poke1_url,p2:m1_poke2_url,p3:m1_poke3_url},
      {n:2,name:member_name_2,p1:m2_poke1_url,p2:m2_poke2_url,p3:m2_poke3_url},
      {n:3,name:member_name_3,p1:m3_poke1_url,p2:m3_poke2_url,p3:m3_poke3_url},
      {n:4,name:member_name_4,p1:m4_poke1_url,p2:m4_poke2_url,p3:m4_poke3_url},
    ];
    for(const m of mems){
      if(!m.name) continue;
      const f=(req.files[`member_icon_${m.n}`]||[])[0];
      await pool.query(
        `INSERT INTO team_members(team_id,member_name,member_icon,member_icon_mime,poke1_url,poke2_url,poke3_url)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [id, m.name, f?.buffer||null, f?.mimetype||null, m.p1||null, m.p2||null, m.p3||null]
      );
    }
    res.json({ok:true, team_id:id});
  }catch(e){ console.error(e); res.status(500).json({error:'failed to create team'}); }
});

app.get('/api/teams', async (req,res)=>{
  const { rows: teams } = await pool.query('SELECT id, team_name, leader_name, leader_poke1_url, leader_poke2_url, leader_poke3_url, (leader_icon IS NOT NULL) AS has_leader_icon FROM teams ORDER BY id');
  const { rows: members } = await pool.query('SELECT id, team_id, member_name, poke1_url, poke2_url, poke3_url, (member_icon IS NOT NULL) AS has_member_icon FROM team_members ORDER BY id');
  const byTeam={}; for(const m of members){ (byTeam[m.team_id] ||= []).push(m); }
  res.json(teams.map(t=>({...t, members: byTeam[t.id]||[]})));
});

app.get('/api/teams/:id', async (req,res)=>{
  const id=Number(req.params.id);
  const { rows: trows } = await pool.query('SELECT id, team_name, leader_name, leader_poke1_url, leader_poke2_url, leader_poke3_url FROM teams WHERE id=$1',[id]);
  if(!trows[0]) return res.status(404).json({error:'not found'});
  const { rows: mems } = await pool.query('SELECT id, team_id, member_name, poke1_url, poke2_url, poke3_url FROM team_members WHERE team_id=$1 ORDER BY id',[id]);
  res.json({ ...trows[0], members: mems });
});

app.put('/api/teams/:id', requireAdmin, upload.fields([
  {name:'leader_icon',maxCount:1},
  {name:'member_icon_1',maxCount:1},
  {name:'member_icon_2',maxCount:1},
  {name:'member_icon_3',maxCount:1},
  {name:'member_icon_4',maxCount:1},
]), async (req,res)=>{
  try{
    const id=Number(req.params.id);
    const has = await pool.query('SELECT 1 FROM teams WHERE id=$1',[id]);
    if(!has.rowCount) return res.status(404).json({error:'not found'});
    const { team_name, leader_name, leader_poke1_url, leader_poke2_url, leader_poke3_url,
      member_name_1, m1_poke1_url, m1_poke2_url, m1_poke3_url,
      member_name_2, m2_poke1_url, m2_poke2_url, m2_poke3_url,
      member_name_3, m3_poke1_url, m3_poke2_url, m3_poke3_url,
      member_name_4, m4_poke1_url, m4_poke2_url, m4_poke3_url } = req.body;
    const lf=(req.files['leader_icon']||[])[0];
    await pool.query(
      `UPDATE teams SET
        team_name=COALESCE($1,team_name),
        leader_name=COALESCE($2,leader_name),
        leader_icon=COALESCE($3,leader_icon),
        leader_icon_mime=COALESCE($4,leader_icon_mime),
        leader_poke1_url=COALESCE($5,leader_poke1_url),
        leader_poke2_url=COALESCE($6,leader_poke2_url),
        leader_poke3_url=COALESCE($7,leader_poke3_url)
       WHERE id=$8`,
      [team_name||null, leader_name||null, lf?lf.buffer:null, lf?lf.mimetype:null, leader_poke1_url||null, leader_poke2_url||null, leader_poke3_url||null, id]
    );
    const { rows: mems } = await pool.query('SELECT id FROM team_members WHERE team_id=$1 ORDER BY id',[id]);
    const up = async (idx, fields, iconFieldName) => {
      if(!mems[idx]) return;
      const f=(req.files[iconFieldName]||[])[0];
      await pool.query(
        `UPDATE team_members SET
          member_name=COALESCE($1,member_name),
          member_icon=COALESCE($2,member_icon),
          member_icon_mime=COALESCE($3,member_icon_mime),
          poke1_url=COALESCE($4,poke1_url),
          poke2_url=COALESCE($5,poke2_url),
          poke3_url=COALESCE($6,poke3_url)
         WHERE id=$7`,
        [fields.name||null, f?f.buffer:null, f?f.mimetype:null, fields.p1||null, fields.p2||null, fields.p3||null, mems[idx].id]
      );
    };
    await up(0,{name:member_name_1,p1:m1_poke1_url,p2:m1_poke2_url,p3:m1_poke3_url},'member_icon_1');
    await up(1,{name:member_name_2,p1:m2_poke1_url,p2:m2_poke2_url,p3:m2_poke3_url},'member_icon_2');
    await up(2,{name:member_name_3,p1:m3_poke1_url,p2:m3_poke2_url,p3:m3_poke3_url},'member_icon_3');
    await up(3,{name:member_name_4,p1:m4_poke1_url,p2:m4_poke2_url,p3:m4_poke3_url},'member_icon_4');
    res.json({ok:true});
  }catch(e){ console.error(e); res.status(500).json({error:'failed to update team'}); }
});

app.delete('/api/teams/:id', requireAdmin, async (req,res)=>{
  try{ await pool.query('DELETE FROM teams WHERE id=$1',[Number(req.params.id)]); res.json({ok:true}); }
  catch(e){ console.error(e); res.status(500).json({error:'failed to delete team'}); }
});

// BLOB images with no-store cache
app.get('/img/leader/:teamId', async (req,res)=>{
  const { rows } = await pool.query('SELECT leader_icon, leader_icon_mime FROM teams WHERE id=$1',[req.params.teamId]);
  if(!rows[0]?.leader_icon) return res.status(404).end();
  res.set('Content-Type', rows[0].leader_icon_mime || 'image/png');
  res.set('Cache-Control', 'no-store');
  res.send(rows[0].leader_icon);
});
app.get('/img/member/:memberId', async (req,res)=>{
  const { rows } = await pool.query('SELECT member_icon, member_icon_mime FROM team_members WHERE id=$1',[req.params.memberId]);
  if(!rows[0]?.member_icon) return res.status(404).end();
  res.set('Content-Type', rows[0].member_icon_mime || 'image/png');
  res.set('Cache-Control', 'no-store');
  res.send(rows[0].member_icon);
});

// schedule & standings
app.post('/api/schedule/generate', requireAdmin, async (req,res)=>{
  try{
    const { rows: teams } = await pool.query('SELECT id FROM teams ORDER BY id');
    const ids = teams.map(t=>t.id);
    if(ids.length<2) return res.status(400).json({error:'need at least 2 teams'});
    const packed = generateRoundRobin(ids);
    await pool.query('BEGIN'); await pool.query('DELETE FROM matches');
    let round=1; for(const group of packed){ let slot=1; for(const [a,b] of group){
      await pool.query('INSERT INTO matches(round,slot,team_a,team_b) VALUES($1,$2,$3,$4)',[round,slot,a,b]); slot++; } round++; }
    await pool.query('COMMIT'); res.json({ok:true, rounds:packed.length});
  }catch(e){ await pool.query('ROLLBACK'); console.error(e); res.status(500).json({error:'failed to generate schedule'}); }
});
app.get('/api/schedule', async (req,res)=>{
  const { rows } = await pool.query(`
    SELECT m.*, a.team_name AS team_a_name, b.team_name AS team_b_name
    FROM matches m
    LEFT JOIN teams a ON a.id = m.team_a
    LEFT JOIN teams b ON b.id = m.team_b
    ORDER BY round ASC, slot ASC, id ASC`);
  const g={}; for(const r of rows){ (g[r.round] ||= []).push(r); } res.json(g);
});
app.post('/api/match/:id/result', requireAdmin, async (req,res)=>{
  try{
    const id=Number(req.params.id);
    const { winner_team_id, most_score_team_id, most_kills_team_id, most_assists_team_id } = req.body;
    const { rows } = await pool.query('SELECT * FROM matches WHERE id=$1',[id]);
    const m=rows[0]; if(!m) return res.status(404).json({error:'match not found'});
    if(m.locked) return res.status(400).json({error:'locked'});
    if(![m.team_a,m.team_b].includes(Number(winner_team_id))) return res.status(400).json({error:'winner must be team_a or team_b'});
    for(const t of [most_score_team_id, most_kills_team_id, most_assists_team_id]){
      if(t!=null && ![m.team_a,m.team_b].includes(Number(t))) return res.status(400).json({error:'award team must be among the two teams'});
    }
    await pool.query(`UPDATE matches SET winner_team_id=$1, most_score_team_id=$2, most_kills_team_id=$3, most_assists_team_id=$4, locked=true WHERE id=$5`,
      [winner_team_id, most_score_team_id, most_kills_team_id, most_assists_team_id, id]);
    res.json({ok:true});
  }catch(e){ console.error(e); res.status(500).json({error:'failed to submit result'}); }
});
app.get('/api/standings', async (req,res)=>{ res.json(await computeStandings()); });

app.get('/', (req,res)=>{ res.sendFile(path.join(__dirname,'public','index.html')); });

initDb().then(()=> app.listen(PORT, ()=>console.log(`Server on :${PORT}`)) );
