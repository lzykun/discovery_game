
// ── State ─────────────────────────────────────────────────────────────────
let notesData = {};

const msgState = {
  conditionMessages: messages[COND] || [],
  readIds: new Set(),
  notebook: [],
  notebookDeleted: [],
  currentMsg: null,
  msgOpenTime: null,        // timestamp when modal opened
  dwellTimes: [],           // [{ sampleId, rank, dwellMs }]
};

// ── Init ───────────────────────────────────────────────────────────────────
function initMessages() {
  renderLeaderboard();
  document.getElementById('msg-modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeMsgModal();
  });
}

// ── Leaderboard ────────────────────────────────────────────────────────────
function renderLeaderboard() {
  const container = document.getElementById('leaderboard');
  const maxPoints = Math.max(...msgState.conditionMessages.map(m => m.total_points));

  msgState.conditionMessages.forEach((msg, i) => {
    const pct = Math.round((msg.total_points / maxPoints) * 100);

    const row = document.createElement('div');
    row.className = 'lb-row';
    row.id = `lb-row-${msg.sample_id}`;

    const rank = document.createElement('span');
    rank.className = 'lb-rank';
    rank.textContent = `#${i + 1}`;

    const btn = document.createElement('button');
    btn.className = 'lb-icon-btn';
    btn.title = `Read message from Player ${i + 1}`;
    btn.onclick = () => openMsgModal(msg.sample_id);

    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    drawAvatar(canvas, i, msgState.conditionMessages.length);
    btn.appendChild(canvas);

    const barWrap = document.createElement('div');
    barWrap.className = 'lb-bar-wrap';

    const bar = document.createElement('div');
    bar.className = 'lb-bar';
    bar.style.width = `${pct}%`;

    const pts = document.createElement('span');
    pts.className = 'lb-points';
    pts.textContent = `${msg.total_points.toLocaleString()} pts`;

    barWrap.appendChild(bar);
    barWrap.appendChild(pts);
    row.appendChild(rank);
    row.appendChild(btn);
    row.appendChild(barWrap);
    container.appendChild(row);
  });
}

function drawAvatar(canvas, index, total) {
  const ctx = canvas.getContext('2d');
  const hue = Math.round((index / total) * 360);
  ctx.fillStyle = `hsl(${hue}, 65%, 55%)`;
  ctx.beginPath();
  ctx.arc(20, 20, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(index + 1, 20, 20);
}

// ── Modal ──────────────────────────────────────────────────────────────────
function openMsgModal(sampleId) {
  msgState.msgOpenTime = Date.now();
  
  const msg = msgState.conditionMessages.find(m => m.sample_id === sampleId);
  if (!msg) return;
  msgState.currentMsg = msg;

  const rank = msgState.conditionMessages.indexOf(msg) + 1;
  document.getElementById('msg-modal-rank').textContent = `#${rank}`;
  document.getElementById('msg-modal-how').textContent = msg.messageHow.replace(/\\n+/g, ' ');
  document.getElementById('msg-modal-rules').textContent = msg.messageRules.replace(/\\n+/g, ' ')  
  document.getElementById('msg-modal-overlay').style.display = 'flex';

  msgState.readIds.add(sampleId);
  unlockContinueIfReady();

  const btn = document.querySelector(`#lb-row-${sampleId} .lb-icon-btn`);
  if (btn) btn.classList.add('lb-visited');
}

function closeMsgModal() {
  if (msgState.currentMsg && msgState.msgOpenTime !== null) {
    const dwellMs = Date.now() - msgState.msgOpenTime;
    const rank = msgState.conditionMessages.indexOf(msgState.currentMsg) + 1;

    msgState.dwellTimes.push({ 
      msgEventId: `msg-${msgState.currentMsg.sample_id}-${msgState.dwellTimes.length + 1}`,
      sampleId: msgState.currentMsg.sample_id, 
      rank,
      dwellMs,
      openedAt: new Date(msgState.msgOpenTime).toISOString(),
      closedAt: new Date().toISOString(),
    });
  }

  msgState.msgOpenTime = null;
  document.getElementById('msg-modal-overlay').style.display = 'none';
  msgState.currentMsg = null;
  unlockContinueIfReady();
}

// ── Notebook ───────────────────────────────────────────────────────────────
function saveHighlightToNotebook() {
  const selection = window.getSelection().toString().trim();
  if (!selection) {
    showNotebookHint('Please highlight some text in the message first.');
    return;
  }
  const rank = msgState.conditionMessages.indexOf(msgState.currentMsg) + 1;
  msgState.notebook.push({ 
    from: `Player #${rank}`,
    text: selection, 
    sampleId: msgState.currentMsg.sample_id,
    savedAt: new Date().toISOString()
  });
  renderNotebook();
  window.getSelection().removeAllRanges();
}

function renderNotebook() {
  const list = document.getElementById('notebook-list');
  const hint = document.getElementById('notebook-empty-hint');
  hint.style.display = msgState.notebook.length ? 'none' : 'block';
  list.innerHTML = '';
  msgState.notebook.forEach((entry, i) => {
    const li = document.createElement('li');

    const label = document.createElement('em');
    label.textContent = `${entry.from}: `;

    const text = document.createTextNode(`"${entry.text}" `);

    const del = document.createElement('button');
    del.className = 'nb-delete';
    del.textContent = '\u2715';
    del.onclick = () => deleteNote(i);

    li.appendChild(label);
    li.appendChild(text);
    li.appendChild(del);
    list.appendChild(li);
  });
}

function deleteNote(i) {
  const entry = msgState.notebook[i];
  entry.deletedAt = new Date().toISOString();
  msgState.notebookDeleted.push(entry);
  msgState.notebook.splice(i, 1);
  unlockContinueIfReady();
  renderNotebook();
}

function showNotebookHint(msg) {
  const hint = document.getElementById('notebook-empty-hint');
  hint.textContent = msg;
  hint.style.display = 'block';
  setTimeout(renderNotebook, 2000);
}

// ── Gate ───────────────────────────────────────────────────────────────────
function unlockContinueIfReady() {
  const ready = msgState.readIds.size >= 1 && msgState.notebook.length >= 1;
  document.getElementById('messages-btn').disabled = !ready;
}

// ── Reflect phase ───────────────────────────────────────────────────────────
function showReflect() {

  const now = new Date();
  msgState.reflectStartedAt = now.toISOString();
  subjectData['messages_browse_duration'] = now - messages_browse_start_time;
  messages_reflect_start_time = now;
  
  // Populate the read-only notebook copy
  const list = document.getElementById('reflect-notebook-list');
  const empty = document.getElementById('reflect-notebook-empty');
  list.innerHTML = '';
  if (msgState.notebook.length === 0) {
    empty.style.display = 'block';
  } else {
    msgState.notebook.forEach(entry => {
      const li = document.createElement('li');
      li.textContent = `${entry.from}: "${entry.text}"`;
      list.appendChild(li);
    });
  }

  document.getElementById('messages-browse').style.display = 'none';
  document.getElementById('messages-reflect').style.display = 'block';

}

function handleReflectDone() {
  
  const reflect_end = new Date();
  start_task_time = reflect_end; 
  subjectData['messages_reflect_duration'] = reflect_end - messages_reflect_start_time;
  
  subjectData.notebook = msgState.notebook.map(e => ({ from: e.from, text: e.text, sampleId: e.sampleId }));
  subjectData.summary = sanitizeText(document.getElementById('reflect-text').value.trim());
  
  notesData.condition = COND;
  notesData.msgsRead = msgState.dwellTimes;
  notesData.notebook = msgState.notebook;
  notesData.notebookDeleted = msgState.notebookDeleted;
  notesData.summary = subjectData.summary;
  
  applyStrategyToTask();
  hideAndShowNext('messages', 'task', 'block');

  // console.log(notesData);
}

function applyStrategyToTask() {
  const text = subjectData.summary || '';
  document.getElementById('task-strategy-text').textContent = text;
}

// Unlock Start button only when participant has typed something
document.getElementById('reflect-text').addEventListener('input', function() {
  document.getElementById('reflect-btn').disabled = this.value.trim().length === 0;
});

// ── Start ──────────────────────────────────────────────────────────────────
initMessages();