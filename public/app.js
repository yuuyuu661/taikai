
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
  $$('.actions').forEach(el => el.style.display = isAdmin ? 'flex' : 'none');
}
$('#adminKey').addEventListener('input', reflectAdmin);
reflectAdmin();

// member inputs for create
(function buildMembers(){
  const wrap = document.getElementById('members');
  const parts = [];
  for (let i=1;i<=4;i++){
    parts.push(
`<div style="grid-column: 1 / -1; font-weight:700; margin-top:6px;">メンバー${i}</div>
<div><label>名前</label><input type="text" name="member_name_${i}" placeholder="任意"></div>
<div><label>アイコン</label><input type="file" name="member_icon_${i}" accept="image/*"></div>
<div><label>使用ポケモンURL</label><input type="url" name="m${i}_poke1_url" placeholder="https://..."></div>
<div><label>　</label><input type="url" name="m${i}_poke2_url" placeholder="https://..."></div>
<div><label>　</label><input type="url" name="m${i}_poke3_url" placeholder="https://..."></div>`
    );
  }
  wrap.innerHTML = parts.join('');
})();

function slot(url){ return url ? `<span class="slot"><img src="${url}" alt="poke"></span>` : `<span class="slot empty"></span>`; }
function pokeSlots(arr){ const u=(arr||[]).filter(Boolean); return [0,1,2].map(i=>slot(u[i])).join(''); }

function teamCard(t) {
  const leaderIcon = `<img src="/img/leader/${t.id}" class="icon" alt="leader" onerror="this.style.display='none'">`;
  const memHtml = (t.members||[]).slice(0,4).map((m, idx) => `
    <div class="rowline">
      <div class="who">
        <span class="tag">メンバー${idx+1}</span>
        <img src="/img/member/${m.id}" class="icon" alt="member" onerror="this.style.display='none'">
        <span>${m.member_name||''}</span>
      </div>
      <div class="poke">${pokeSlots([m.poke1_url, m.poke2_url, m.poke3_url])}</div>
    </div>
  `).join('');

  // 編集フォーム（折りたたみ）
  const editForm = `
    <form class="editbox only-admin" data-edit="${t.id}" style="display:none">
      <div class="row">
        <div><label>チーム名</label><input type="text" name="team_name" value="${t.team_name||''}"></div>
        <div><label>リーダー名</label><input type="text" name="leader_name" value="${t.leader_name||''}"></div>
        <div><label>リーダーアイコン</label><input type="file" name="leader_icon" accept="image/*"></div>
        <div><label>リーダーP1</label><input type="url" name="leader_poke1_url" value="${t.leader_poke1_url||''}" placeholder="https://..."></div>
        <div><label>リーダーP2</label><input type="url" name="leader_poke2_url" value="${t.leader_poke2_url||''}" placeholder="https://..."></div>
        <div><label>リーダーP3</label><input type="url" name="leader_poke3_url" value="${t.leader_poke3_url||''}" placeholder="https://..."></div>
      </div>
      <hr>
      <div class="row">
        ${t.members.slice(0,4).map((m,i)=>`
          <div style="grid-column:1/-1; font-weight:700;">メンバー${i+1}</div>
          <div><label>名前</label><input type="text" name="member_name_${i+1}" value="${m.member_name||''}"></div>
          <div><label>アイコン</label><input type="file" name="member_icon_${i+1}" accept="image/*"></div>
          <div><label>P1</label><input type="url" name="m${i+1}_poke1_url" value="${m.poke1_url||''}" placeholder="https://..."></div>
          <div><label>P2</label><input type="url" name="m${i+1}_poke2_url" value="${m.poke2_url||''}" placeholder="https://..."></div>
          <div><label>P3</label><input type="url" name="m${i+1}_poke3_url" value="${m.poke3_url||''}" placeholder="https://..."></div>
        `).join('')}
      </div>
      <div style="margin-top:6px; display:flex; gap:6px; justify-content:flex-end;">
        <button type="button" data-action="cancel">キャンセル</button>
        <button type="submit">保存</button>
      </div>
    </form>
  `;

  return `<div class="team-card" data-id="${t.id}">
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
    <div class="actions" style="display:none">
      <button data-action="edit">編集</button>
      <button data-action="delete" class="secondary">削除</button>
    </div>
    ${editForm}
  </div>`;
}

async function loadTeams() {
  const res = await fetch('/api/teams');
  const teams = await res.json();
  const el = $('#teamList');
  el.innerHTML = teams.map(teamCard).join('');

  // アクションボタン
  el.querySelectorAll('.team-card').forEach(card => {
    const id = card.dataset.id;
    const editBtn = card.querySelector('button[data-action="edit"]');
    const deleteBtn = card.querySelector('button[data-action="delete"]');
    const form = card.querySelector('form[data-edit]');

    editBtn.addEventListener('click', async () => {
      // 最新データ再取得（念のため）
      const data = await (await fetch(`/api/teams/${id}`)).json();
      // 入力値を反映
      form.querySelector('input[name="team_name"]').value = data.team_name||'';
      form.querySelector('input[name="leader_name"]').value = data.leader_name||'';
      form.querySelector('input[name="leader_poke1_url"]').value = data.leader_poke1_url||'';
      form.querySelector('input[name="leader_poke2_url"]').value = data.leader_poke2_url||'';
      form.querySelector('input[name="leader_poke3_url"]').value = data.leader_poke3_url||'';
      (data.members||[]).slice(0,4).forEach((m,i)=>{
        form.querySelector(`input[name="member_name_${i+1}"]`).value = m.member_name||'';
        form.querySelector(`input[name="m${i+1}_poke1_url"]`).value = m.poke1_url||'';
        form.querySelector(`input[name="m${i+1}_poke2_url"]`).value = m.poke2_url||'';
        form.querySelector(`input[name="m${i+1}_poke3_url"]`).value = m.poke3_url||'';
      });
      form.style.display = 'block';
      reflectAdmin();
    });

    form.querySelector('button[data-action="cancel"]').addEventListener('click', () => {
      form.style.display = 'none';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const res = await fetch(`/api/teams/${id}`, { method:'PUT', headers: { 'x-admin-key': adminKey() }, body: fd });
      if (!res.ok) { const j = await res.json().catch(()=>({})); return alert('更新エラー: '+(j.error||res.status)); }
      form.style.display = 'none';
      await Promise.all([loadTeams(), loadStandings(), loadSchedule()]);
    });

    deleteBtn.addEventListener('click', async () => {
      if (!confirm('本当にこのチームを削除しますか？（メンバー情報は消え、対戦表の該当欄は空になります）')) return;
      const res = await fetch(`/api/teams/${id}`, { method:'DELETE', headers: { 'x-admin-key': adminKey() } });
      if (!res.ok) { const j = await res.json().catch(()=>({})); return alert('削除エラー: '+(j.error||res.status)); }
      await Promise.all([loadTeams(), loadStandings(), loadSchedule()]);
    });
  });

  reflectAdmin();
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

// create
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
  await Promise.all([loadTeams(), loadSchedule(), loadStandings()]);
  reflectAdmin();
})();
