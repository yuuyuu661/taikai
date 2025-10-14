
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const adminKey = () => $('#adminKey').value.trim();

// tabs
$$('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tabs button').forEach(b => b.classList.remove('active'));
    $$('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    $('#'+btn.dataset.tab).classList.add('active');
  });
});

function reflectAdmin() {
  const isAdmin = !!adminKey();
  $$('.only-admin').forEach(el => el.classList.toggle('show', isAdmin));
}
$('#adminKey').addEventListener('input', reflectAdmin);
reflectAdmin();

// images -> selects
let imageOptions = [];
async function loadImages() {
  const res = await fetch('/api/images');
  imageOptions = await res.json();
  function fillSelect(sel) {
    sel.innerHTML = '<option value="">— 選択 —</option>' + imageOptions.map(p => `<option value="${p}">${p.replace('/images/','')}</option>`).join('');
  }
  ['leader_p1','leader_p2','leader_p3'].forEach(id => fillSelect($('#'+id)));
  for (let i=1;i<=4;i++) ['1','2','3'].forEach(n => fillSelect($(`#m${i}_p${n}`)));
}

// member inputs
(function buildMembers(){
  const wrap = document.getElementById('members');
  const parts = [];
  for (let i=1;i<=4;i++){
    parts.push(
`<div style="grid-column: 1 / -1; font-weight:700; margin-top:6px;">メンバー${i}</div>
<div><label>名前</label><input type="text" name="member_name_${i}" placeholder="任意"></div>
<div><label>アイコン</label><input type="file" name="member_icon_${i}" accept="image/*"></div>
<div><label>使用ポケモン</label><select name="m${i}_poke1_url" id="m${i}_p1"></select></div>
<div><label>　</label><select name="m${i}_poke2_url" id="m${i}_p2"></select></div>
<div><label>　</label><select name="m${i}_poke3_url" id="m${i}_p3"></select></div>`
    );
  }
  wrap.innerHTML = parts.join('');
})();

function pokeSlots(arr) {
  const urls = (arr||[]).filter(Boolean);
  const out = [];
  for (let i=0;i<3;i++){
    const u = urls[i];
    if (u) out.push(`<span class="slot"><img src="${u}" alt="poke"></span>`);
    else out.push(`<span class="slot empty"></span>`);
  }
  return out.join('');
}

async function loadTeams() {
  const res = await fetch('/api/teams');
  const teams = await res.json();
  const el = $('#teamList');
  el.innerHTML = teams.map(t => {
    const leaderIcon = t.leader_icon ? `<img src="/img/leader/${t.id}" class="icon" alt="leader">` : '';
    const memHtml = (t.members||[]).slice(0,4).map((m, idx) => `
      <div class="rowline">
        <div class="who">
          <span class="tag">メンバー${idx+1}</span>
          ${m.member_icon ? `<img src="/img/member/${m.id}" class="icon" alt="member">` : ''}
          <span>${m.member_name||''}</span>
        </div>
        <div class="poke">${pokeSlots([m.poke1_url, m.poke2_url, m.poke3_url])}</div>
      </div>
    `).join('');

    return `<div class="team-card">
      <div class="header">${t.team_name||''}</div>
      <div class="rowline">
        <div class="who">
          <span class="tag">リーダー</span>
          ${leaderIcon}
          <span>${t.leader_name||''}</span>
        </div>
        <div class="poke">${pokeSlots([t.leader_poke1_url, t.leader_poke2_url, t.leader_poke3_url])}</div>
      </div>
      ${memHtml}
    </div>`;
  }).join('');
}

async function loadSchedule() {
  const res = await fetch('/api/schedule');
  const data = await res.json();
  const sched = $('#schedule');
  sched.innerHTML = '';
  const rounds = Object.keys(data).map(Number).sort((a,b)=>a-b);
  for (const r of rounds) {
    const ms = data[r];
    const card = document.createElement('div');
    card.className = 'match';
    card.innerHTML = `<div style="font-weight:700; margin-bottom:6px;">ラウンド ${r}</div>` +
      ms.map(m => `
        <div style="display:grid; grid-template-columns: 1fr auto 1fr; gap:6px; align-items:center; border:1px solid #eee; border-radius:8px; padding:6px; margin-bottom:6px;">
          <div>${m.team_a_name||'TBD'}</div>
          <div style="opacity:.6;">vs</div>
          <div>${m.team_b_name||'TBD'}</div>
          <div style="grid-column: 1 / -1; display:flex; gap:6px; align-items:center;">
            <select data-mid="${m.id}" data-field="winner">
              <option value="">— 勝者を選択 —</option>
              <option value="${m.team_a}">${m.team_a_name}</option>
              <option value="${m.team_b}">${m.team_b_name}</option>
            </select>
            <select data-mid="${m.id}" data-field="score">
              <option value="">最多スコア</option>
              <option value="${m.team_a}">${m.team_a_name}</option>
              <option value="${m.team_b}">${m.team_b_name}</option>
            </select>
            <select data-mid="${m.id}" data-field="kills">
              <option value="">最大キル</option>
              <option value="${m.team_a}">${m.team_a_name}</option>
              <option value="${m.team_b}">${m.team_b_name}</option>
            </select>
            <select data-mid="${m.id}" data-field="assists">
              <option value="">最多アシスト</option>
              <option value="${m.team_a}">${m.team_a_name}</option>
              <option value="${m.team_b}">${m.team_b_name}</option>
            </select>
            <button data-mid="${m.id}" class="commit only-admin">結果確定</button>
          </div>
        </div>
      `).join('');
    sched.appendChild(card);
  }
  reflectAdmin();
  sched.querySelectorAll('button.commit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.mid;
      const val = sel => sched.querySelector(`select[data-mid="${id}"][data-field="${sel}"]`).value;
      const payload = {
        winner_team_id: Number(val('winner')),
        most_score_team_id: val('score')? Number(val('score')): null,
        most_kills_team_id: val('kills')? Number(val('kills')): null,
        most_assists_team_id: val('assists')? Number(val('assists')): null,
      };
      if (!payload.winner_team_id) return alert('勝者を選択してください');
      const res = await fetch(`/api/match/${id}/result`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey() }, body: JSON.stringify(payload)
      });
      if (!res.ok) { const j = await res.json().catch(()=>({})); return alert('エラー: '+(j.error||res.status)); }
      await Promise.all([loadSchedule(), loadStandings()]);
    });
  });
}

async function loadStandings() {
  const res = await fetch('/api/standings');
  const data = await res.json();
  const t = $('#standings');
  t.innerHTML = `<thead><tr><th>順位</th><th>チーム</th><th>P</th><th>勝</th><th>敗</th><th>試合</th><th>ボーナス</th></tr></thead>` +
    '<tbody>' + data.map((r,i)=>`<tr><td>${i+1}</td><td>${r.team_name}</td><td>${r.pts}</td><td>${r.win}</td><td>${r.lose}</td><td>${r.played}</td><td>${r.bonus}</td></tr>`).join('') + '</tbody>';
}

document.getElementById('teamForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const res = await fetch('/api/teams', { method:'POST', headers: { 'x-admin-key': adminKey() }, body: fd });
  if (!res.ok) { const j = await res.json().catch(()=>({})); return alert('登録エラー: '+(j.error||res.status)); }
  e.currentTarget.reset();
  await Promise.all([loadTeams(), loadStandings()]);
});

document.getElementById('btnGen').addEventListener('click', async () => {
  if (!confirm('既存の対戦表を全削除して新規生成します。よろしいですか？')) return;
  const res = await fetch('/api/schedule/generate', { method:'POST', headers: { 'x-admin-key': adminKey() } });
  if (!res.ok) { const j = await res.json().catch(()=>({})); return alert('生成エラー: '+(j.error||res.status)); }
  await Promise.all([loadSchedule(), loadStandings()]);
});

document.getElementById('btnReload').addEventListener('click', async () => {
  await Promise.all([loadTeams(), loadSchedule(), loadStandings()]);
});

(async function init(){
  await loadImages();  // ← これでプルダウンに表示されます
  await Promise.all([loadTeams(), loadSchedule(), loadStandings()]);
  reflectAdmin();
})();
