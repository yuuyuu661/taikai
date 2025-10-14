
const $ = sel => document.querySelector(sel);
const adminKey = () => $('#adminKey').value.trim();

// メンバー入力 4名分を生成
(function buildMembers(){
  const wrap = document.getElementById('members');
  const parts = [];
  for (let i=1;i<=4;i++){
    parts.push(
`<div style="grid-column: 1 / -1; font-weight:700; margin-top:6px;">メンバー${i}</div>
<div><label>名前</label><input type="text" name="member_name_${i}" placeholder="任意"></div>
<div><label>アイコン</label><input type="file" name="member_icon_${i}" accept="image/*"></div>
<div><label>使用ポケモン画像URL 1</label><input type="url" name="m${i}_poke1_url" placeholder="https://..."></div>
<div><label>使用ポケモン画像URL 2</label><input type="url" name="m${i}_poke2_url" placeholder="https://..."></div>
<div><label>使用ポケモン画像URL 3</label><input type="url" name="m${i}_poke3_url" placeholder="https://..."></div>`
    );
  }
  wrap.innerHTML = parts.join('');
})();

function imgTag(url, alt='img') {
  if (!url) return '';
  const safe = String(url).replace(/"/g,'&quot;');
  return `<img src="${safe}" alt="${alt}" style="height:28px; aspect-ratio:1; object-fit:cover; border-radius:6px; border:1px solid #ddd;">`;
}

async function loadTeams() {
  const res = await fetch('/api/teams');
  const teams = await res.json();
  const el = $('#teamList');
  el.innerHTML = '<h3>登録済みチーム</h3>' + teams.map(t => {
    const leaderIcon = t.leader_icon ? `<img src="/img/leader/${t.id}" style="height:32px; width:32px; border-radius:8px; border:1px solid #ddd; object-fit:cover;">` : '';
    const lp = [t.leader_poke1_url, t.leader_poke2_url, t.leader_poke3_url].map(u => imgTag(u)).join('');
    const memHtml = (t.members||[]).map(m => `
      <div style="display:flex; align-items:center; gap:8px;">
        ${m.member_icon ? `<img src="/img/member/${m.id}" style="height:24px; width:24px; border-radius:6px; border:1px solid #ddd; object-fit:cover;">` : ''}
        <span>${m.member_name||''}</span>
        <span>${imgTag(m.poke1_url)} ${imgTag(m.poke2_url)} ${imgTag(m.poke3_url)}</span>
      </div>
    `).join('');
    return `<div class="match">
      <div style="display:flex; align-items:center; gap:8px; font-weight:700;">
        ${leaderIcon}<span>${t.team_name}</span>
        <span class="badge">${t.leader_name}</span>
        <span style="margin-left:auto">${lp}</span>
      </div>
      <div style="margin-top:6px; display:grid; gap:4px;">${memHtml}</div>
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
            <button data-mid="${m.id}" class="commit">結果確定</button>
          </div>
          ${m.winner_team_id ? `<div style="grid-column:1/-1; color:green;">済: 勝者 ${m.winner_team_id===m.team_a?m.team_a_name:m.team_b_name}</div>` : ''}
        </div>
      `).join('');
    sched.appendChild(card);
  }

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

document.getElementById('teamForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const res = await fetch('/api/teams', { method:'POST', body: fd });
  if (!res.ok) { const j = await res.json().catch(()=>({})); return alert('登録エラー: '+(j.error||res.status)); }
  e.currentTarget.reset();
  await loadTeams();
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
  await Promise.all([loadTeams(), loadSchedule(), loadStandings()]);
})();
