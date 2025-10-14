
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

// 管理者UIの表示切替
function reflectAdmin() {
  const isAdmin = !!adminKey();
  $$('.only-admin').forEach(el => el.classList.toggle('show', isAdmin));
}
$('#adminKey').addEventListener('input', reflectAdmin);
reflectAdmin();

// 画像リスト取得 → セレクトに反映
let imageOptions = [];
async function loadImages() {
  const res = await fetch('/api/images');
  imageOptions = await res.json();
  function fillSelect(sel) {
    sel.innerHTML = '<option value="">— 選択 —</option>' + imageOptions.map(p => `<option value="${p}">${p.replace('/images/','')}</option>`).join('');
  }
  ['leader_p1','leader_p2','leader_p3'].forEach(id => fillSelect($('#'+id)));
  for (let i=1;i<=4;i++) {
    ['1','2','3'].forEach(n => fillSelect($(`#m${i}_p${n}`)));
  }
}

// メンバー入力 4名分を生成
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

function imgTag(url, alt='img') {
  if (!url) return '';
  const safe = String(url).replace(/"/g,'&quot;');
  return `<img src="${safe}" alt="${alt}" style="height:28px; aspect-ratio:1; object-fit:cover; border-radius:6px; border:1px solid #ddd;">`;
}

async function loadTeams() {
  const res = await fetch('/api/teams');
  const teams = await res.json();
  const el = $('#teamList');
  el.innerHTML = teams.map(t => {
    const leaderIcon = t.leader_icon ? `<img src="/img/leader/${t.id}" style="height:32px; width:32px; border-radius:8px; border:1px solid #ddd; object-fit:cover;">` : '';
    const lp = [t.leader_poke1_url, t.leader_poke2_url, t.leader_poke3_url].map(u => imgTag(u)).join('');
    const memHtml = (t.members||[]).map((m,idx) => `
      <div style="display:flex; align-items:center; gap:8px;">
        ${m.member_icon ? `<img src="/img/member/${m.id}" style="height:24px; width:24px; border-radius:6px; border:1px solid #ddd; object-fit:cover;">` : ''}
        <span>${m.member_name||''}</span>
        <span>${imgTag(m.poke1_url)} ${imgTag(m.poke2_url)} ${imgTag(m.poke3_url)}</span>
      </div>
    `).join('');
    const editBtn = adminKey() ? `<button class="edit" data-id="${t.id}">編集</button>` : '';
    return `<div class="match">
      <div style="display:flex; align-items:center; gap:8px; font-weight:700;">
        ${leaderIcon}<span>${t.team_name}</span>
        <span class="badge">${t.leader_name}</span>
        <span style="margin-left:auto">${lp}</span>
        ${editBtn}
      </div>
      <div style="margin-top:6px; display:grid; gap:4px;">${memHtml}</div>
      <div class="editor" data-id="${t.id}" style="display:none; margin-top:8px;"></div>
    </div>`;
  }).join('');

  // 編集イベント
  el.querySelectorAll('button.edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const box = el.querySelector(`.editor[data-id="${id}"]`);
      if (box.style.display === 'block') { box.style.display='none'; return; }
      const data = await (await fetch(`/api/teams/${id}`)).json();
      // 編集フォーム生成（簡易）
      const sel = (name, val) => {
        const options = ['<option value="">— 選択 —</option>'].concat(imageOptions.map(p => `<option value="${p}" ${val===p?'selected':''}>${p.replace('/images/','')}</option>`)).join('');
        return `<select name="${name}">${options}</select>`;
      };
      const mem = i => data.members[i] || {};
      box.innerHTML = `
        <form class="editForm" data-id="${id}" enctype="multipart/form-data">
          <div class="row">
            <div><label>チーム名</label><input type="text" name="team_name" value="${data.team_name||''}"></div>
            <div><label>リーダー名</label><input type="text" name="leader_name" value="${data.leader_name||''}"></div>
            <div><label>リーダーアイコン</label><input type="file" name="leader_icon" accept="image/*"></div>
            <div><label>リーダー使用ポケモン</label>${sel('leader_poke1_url', data.leader_poke1_url)}</div>
            <div><label>　</label>${sel('leader_poke2_url', data.leader_poke2_url)}</div>
            <div><label>　</label>${sel('leader_poke3_url', data.leader_poke3_url)}</div>
          </div>
          <hr>
          ${[0,1,2,3].map(i => `
            <div style="font-weight:700; margin-top:6px;">メンバー${i+1}</div>
            <div class="row">
              <div><label>名前</label><input type="text" name="member_name_${i+1}" value="${(mem(i).member_name||'').replace(/"/g,'&quot;')}"></div>
              <div><label>アイコン</label><input type="file" name="member_icon_${i+1}" accept="image/*"></div>
              <div><label>使用ポケモン</label>${sel(`m${i+1}_poke1_url`, mem(i).poke1_url)}</div>
              <div><label>　</label>${sel(`m${i+1}_poke2_url`, mem(i).poke2_url)}</div>
              <div><label>　</label>${sel(`m${i+1}_poke3_url`, mem(i).poke3_url)}</div>
            </div>
          `).join('')}
          <div style="margin-top:8px;"><button>保存</button> <button type="button" class="cancel">キャンセル</button></div>
        </form>
      `;
      box.style.display = 'block';

      box.querySelector('.cancel').addEventListener('click', () => { box.style.display='none'; });
      box.querySelector('form.editForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const res = await fetch(`/api/teams/${id}`, { method:'PUT', headers: { 'x-admin-key': adminKey() }, body: fd });
        if (!res.ok) { const j = await res.json().catch(()=>({})); return alert('更新エラー: '+(j.error||res.status)); }
        alert('更新しました');
        box.style.display='none';
        await loadTeams();
      });
    });
  });
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
  await loadImages();
  await Promise.all([loadTeams(), loadSchedule(), loadStandings()]);
  reflectAdmin();
})();
