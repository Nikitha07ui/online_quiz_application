/* Online Quiz Application – data is saved in the browser (localStorage). */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
let users = load('quiz_users', []);
let me = null;
let run = null, timerId = null;
/* ---------- question bank (sample data) ---------- */
const q = (text, a, b, c, d, ans) => ({ q: text, o: [a, b, c, d], a: ans });
const QUIZZES = [
 { id:'html', title:'HTML Basics', level:'Easy', qs:[
 q('Which tag creates a hyperlink?','<link>','<a>','<href>','<url>',1),
 q('Which tag holds the largest heading?','<h6>','<head>','<h1>','<header>',2),
 q('Which attribute gives alternative text for an image?','title','src','alt','name',2),
 q('Which element is used for an unordered list?','<ol>','<ul>','<li>','<dl>',1),
 q('What does HTML stand for?','HyperText Markup Language','High Text Machine Language','HyperTool Multi Language','Home Text Markup Level',0)] },
 { id:'css', title:'CSS Essentials', level:'Easy', qs:[
 q('Which property changes the text colour?','font-color','color','text-style','fill',1),
 q('Which symbol selects an element by id?','.','#','*','&',1),
 q('Which display value creates a flexible box layout?','block','inline','flex','table-cell',2),
 q('Which property adds space inside the border?','margin','padding','gap','outline',1),
 q('What does CSS stand for?','Cascading Style Sheets','Creative Style System','Computer Style Sheets','Colourful Style Sheets',0)] },
 { id:'js', title:'JavaScript Fundamentals', level:'Medium', qs:[
 q('Which keyword declares a block-scoped variable?','var','let','int','define',1),
 q('What is the result of typeof null?','null','undefined','object','number',2),
 q('Which method adds an item to the end of an array?','push()','pop()','shift()','concat()',0),
 q('Which operator checks value and type?','==','=','===','!=',2),
 q('Which function converts a JSON string to an object?','JSON.parse()','JSON.stringify()','JSON.object()','JSON.read()',0)] },
 { id:'web', title:'Web Concepts', level:'Medium', qs:[
 q('Which HTTP method is normally used to fetch data?','POST','GET','PUT','DELETE',1),
 q('Which storage keeps data after the browser is closed?','localStorage','sessionStorage','a JS variable','the DOM',0),
 q('What does DOM stand for?','Data Object Model','Document Object Model','Display Object Method','Document Order Map',1),
 q('Which status code means "Not Found"?','200','301','404','500',2),
 q('Which protocol secures web traffic?','FTP','HTTP','SMTP','HTTPS',3)] }
];
/* sample entries shown on the leaderboard together with real accounts */
const SAMPLE_BOARD = [
 { name:'Ravi Kumar', taken:4, avg:90, points:18 },
 { name:'Sneha Reddy', taken:4, avg:85, points:17 },
 { name:'Arjun Naidu', taken:3, avg:73, points:11 },
 { name:'Divya Sree', taken:2, avg:60, points:6 }
];
const TIME_PER_Q = 60; /* seconds */
const PASS = 60; /* percent */
/* ---------- helpers ---------- */
const pct = (a, t) => t ? Math.round(a / t * 100) : 0;
const grade = p => p >= 90 ? 'A+' : p >= 80 ? 'A' : p >= 70 ? 'B' : p >= 60 ? 'C' : p >= 50 ? 'D' : 'F';
const fmtDate = ts => new Date(ts).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
const quizOf = id => QUIZZES.find(x => x.id === id);
const persist = () => save('quiz_users', users);
const stats = u => {
 const n = u.attempts.length;
 const avg = n ? Math.round(u.attempts.reduce((s, a) => s + a.pct, 0) / n) : 0;
 const best = n ? Math.max(...u.attempts.map(a => a.pct)) : 0;
 const passed = u.attempts.filter(a => a.pct >= PASS).length;
 return { n, avg, best, passed, points: u.attempts.reduce((s, a) => s + a.score, 0) };
};
const bestFor = id => { const l = me.attempts.filter(a => a.quizId === id); return l.length ? Math.max(...l.map(a => a.pct)) + '%' : '–'; };
/* ---------- auth ---------- */
function showAuth(which) {
 $('#login-form').classList.toggle('hidden', which !== 'login');
 $('#register-form').classList.toggle('hidden', which !== 'register');
 $('#tab-login').classList.toggle('active', which === 'login');
 $('#tab-register').classList.toggle('active', which === 'register');
 $('#auth-msg').textContent = '';
}
$('#tab-login').onclick = () => showAuth('login');
$('#tab-register').onclick = () => showAuth('register');
$('#register-form').onsubmit = e => {
 e.preventDefault();
 const email = $('#r-email').value.trim().toLowerCase();
 if (users.some(u => u.email === email)) { $('#auth-msg').textContent = 'That email is already registered. Log in instead.'; return; }
 const n = users.length + 1;
 users.push({ email, password: $('#r-pass').value, name: $('#r-name').value.trim(), course: $('#r-course').value,
 roll: 'STU' + String(2026000 + n), phone: '', address: '', dob: '', attempts: [] });
 persist();
 login(email);
};
$('#login-form').onsubmit = e => {
 e.preventDefault();
 const email = $('#l-email').value.trim().toLowerCase();
 const u = users.find(x => x.email === email && x.password === $('#l-pass').value);
 if (!u) { $('#auth-msg').textContent = 'Email or password is incorrect.'; return; }
 login(email);
};
function login(email) {
 save('quiz_session', email);
 me = users.find(u => u.email === email);
 $('#auth').classList.add('hidden');
 $('#app').classList.remove('hidden');
 buildNav();
 route();
}
$('#logout').onclick = () => {
 stopRun();
 localStorage.removeItem('quiz_session');
 me = null;
 $('#app').classList.add('hidden');
 $('#auth').classList.remove('hidden');
 ['#login-form', '#register-form'].forEach(f => $(f).reset());
 showAuth('login');
 location.hash = '';
};
/* ---------- quiz engine ---------- */
function stopRun() { clearInterval(timerId); timerId = null; run = null; }
function startRun(id) {
 const quiz = quizOf(id);
 run = { quiz, i: 0, answers: Array(quiz.qs.length).fill(-1), endAt: Date.now() + quiz.qs.length * TIME_PER_Q * 1000 };
 clearInterval(timerId);
 timerId = setInterval(tick, 500);
}
function tick() {
 const left = Math.max(0, Math.round((run.endAt - Date.now()) / 1000));
 const t = $('#timer');
 if (t) { t.textContent = 'Time left ' + mmss(left); t.classList.toggle('low', left <= 30); }
 if (left === 0) submitRun();
}
function submitRun() {
 const { quiz, answers } = run;
 const score = answers.reduce((s, a, i) => s + (a === quiz.qs[i].a ? 1 : 0), 0);
 const used = Math.round((Date.now() - (run.endAt - quiz.qs.length * TIME_PER_Q * 1000)) / 1000);
 me.attempts.push({ quizId: quiz.id, title: quiz.title, score, total: quiz.qs.length, pct: pct(score, quiz.qs.length),
 date: Date.now(), used: Math.min(used, quiz.qs.length * TIME_PER_Q), answers: answers.slice() });
 persist();
 stopRun();
 location.hash = 'review/' + (me.attempts.length - 1);
}
/* ---------- pages ---------- */
const pages = {
 dashboard() {
 const s = stats(me);
 const next = QUIZZES.find(x => !me.attempts.some(a => a.quizId === x.id));
 const recent = me.attempts.slice(-3).reverse();
 return `<h1>Welcome, ${esc(me.name.split(' ')[0])}</h1><p class="sub">${esc(me.course)} · ${esc(me.roll)}</p>
 <div class="grid">
 <div class="card s1"><div class="muted">Quizzes taken</div><div class="stat">${s.n}</div></div>
 <div class="card s2"><div class="muted">Average score</div><div class="stat">${s.avg}%</div></div>
 <div class="card s3"><div class="muted">Best score</div><div class="stat">${s.best}%</div></div>
 <div class="card s4"><div class="muted">Quizzes passed</div><div class="stat">${s.passed}</div></div>
 </div>
 <h3>Recent attempts</h3>
 <div class="table-wrap"><table>${recent.length ? recent.map(a =>
 `<tr><td>${esc(a.title)}</td><td class="muted">${fmtDate(a.date)}</td><td>${a.score} / ${a.total}</td><td class="${a.pct >= PASS ? 'ok' : 'bad'}">${a.pct >= PASS ? 'Pass' : 'Fail'}</td></tr>`).join('')
 : '<tr><td class="muted">No attempts yet. Start your first quiz.</td></tr>'}</table></div>
 <h3>Suggested next quiz</h3>
 <div class="card">${next ? `<strong>${esc(next.title)}</strong><div class="muted">${next.qs.length} questions · ${next.level}</div><p><a class="btn" href="#quiz/${next.id}">Start quiz</a></p>`
 : '<strong>You have tried every quiz.</strong><div class="muted">Retake any quiz to improve your best score.</div>'}</div>`;
 },
 profile() {
 const f = (id, label, val, type = 'text', cls = '') =>
 `<label class="${cls}">${label}<input id="p-${id}" type="${type}" value="${esc(val)}"></label>`;
 return `<h1>Profile</h1><p class="sub">Keep your details up to date.</p>
 <form id="profile-form" class="profile card">
 ${f('name','Full name',me.name)}
 ${f('roll','Roll number',me.roll,'text','ro')}
 ${f('email','Email',me.email,'email','ro')}
 ${f('course','Course',me.course,'text','ro')}
 ${f('phone','Phone',me.phone,'tel')}
 ${f('dob','Date of birth',me.dob,'date')}
 ${f('address','Address',me.address,'text','full')}
 <div class="full"><button class="primary">Save changes</button><span id="saved" class="toast"></span></div>
 </form>`;
 },
 quizzes() {
 return `<h1>Quizzes</h1><p class="sub">Choose a quiz. Each question gets ${TIME_PER_Q} seconds; ${PASS}% is a pass.</p>
 <div class="table-wrap"><table>
 <tr><th>Quiz</th><th>Level</th><th>Questions</th><th>Time</th><th>Best score</th><th></th></tr>
 ${QUIZZES.map(z => `<tr><td><strong>${z.title}</strong></td><td>${z.level}</td><td>${z.qs.length}</td>
 <td>${mmss(z.qs.length * TIME_PER_Q)}</td><td>${bestFor(z.id)}</td>
 <td><a class="btn" href="#quiz/${z.id}">${me.attempts.some(a => a.quizId === z.id) ? 'Retake' : 'Start'}</a></td></tr>`).join('')}
 </table></div>`;
 },
 quiz(id) {
 if (!quizOf(id)) return pages.quizzes();
 if (!run || run.quiz.id !== id) startRun(id);
 const { quiz, i, answers } = run, k = quiz.qs[i];
 const left = Math.max(0, Math.round((run.endAt - Date.now()) / 1000));
 return `<div class="qhead"><div><h1>${quiz.title}</h1><div class="muted">Question ${i + 1} of ${quiz.qs.length}</div></div>
 <span id="timer" class="timer">Time left ${mmss(left)}</span></div>
 <div class="dots">${answers.map((a, n) => `<i class="${a >= 0 ? 'done' : ''}"></i>`).join('')}</div>
 <div class="card"><div class="qtext">${esc(k.q)}</div>
 ${k.o.map((o, n) => `<button class="opt ${answers[i] === n ? 'sel' : ''}" data-opt="${n}">${String.fromCharCode(65 + n)}. ${esc(o)}</button>`).join('')}
 <div class="row" style="margin-top:.8rem">
 <button class="btn" data-go="-1" ${i === 0 ? 'disabled' : ''}>Previous</button>
 ${i < quiz.qs.length - 1 ? '<button class="btn" data-go="1">Next</button>' : '<button class="btn" data-submit="1">Submit quiz</button>'}
 </div></div>`;
 },
 results() {
 const rows = me.attempts.map((a, n) => ({ a, n })).reverse();
 return `<h1>My Results</h1><p class="sub">Every attempt is saved. Open one to review the answers.</p>
 <div class="table-wrap"><table>
 <tr><th>Quiz</th><th>Date</th><th>Score</th><th>Percent</th><th>Grade</th><th>Result</th><th></th></tr>
 ${rows.length ? rows.map(({ a, n }) => `<tr><td>${esc(a.title)}</td><td>${fmtDate(a.date)}</td><td>${a.score} / ${a.total}</td>
 <td>${a.pct}%</td><td><strong>${grade(a.pct)}</strong></td><td class="${a.pct >= PASS ? 'ok' : 'bad'}">${a.pct >= PASS ? 'Pass' : 'Fail'}</td>
 <td><a class="btn" href="#review/${n}">Review</a></td></tr>`).join('') : '<tr><td class="muted">No attempts yet.</td></tr>'}
 </table></div>`;
 },
 review(n) {
 const a = me.attempts[n];
 if (!a) return pages.results();
 const quiz = quizOf(a.quizId);
 return `<h1>${esc(a.title)} – Review</h1>
 <div class="card s2" style="margin-bottom:1rem"><div class="score">${a.score} / ${a.total} <span class="${a.pct >= PASS ? 'ok' : 'bad'}">${a.pct}% · ${a.pct >= PASS ? 'Pass' : 'Fail'}</span></div>
 <div class="muted">Grade ${grade(a.pct)} · Time used ${mmss(a.used)}</div></div>
 ${quiz.qs.map((k, i) => `<div class="card" style="margin-bottom:.8rem"><div class="qtext">${i + 1}. ${esc(k.q)}</div>
 ${k.o.map((o, j) => `<div class="opt ${j === k.a ? 'right' : j === a.answers[i] ? 'wrong' : ''}">${String.fromCharCode(65 + j)}. ${esc(o)}${j === k.a ? ' ✔' : j === a.answers[i] ? ' ✘ your answer' : ''}</div>`).join('')}
 ${a.answers[i] < 0 ? '<div class="muted warn">Not answered</div>' : ''}</div>`).join('')}
 <p><a class="btn" href="#results">Back to results</a> <a class="btn" href="#quiz/${a.quizId}">Retake quiz</a></p>`;
 },
 leaderboard() {
 const s = stats(me);
 const board = [...SAMPLE_BOARD, ...users.filter(u => u.attempts.length).map(u => { const t = stats(u); return { name: u.name, taken: t.n, avg: t.avg, points: t.points, you: u.email === me.email }; })]
 .sort((x, y) => y.points - x.points || y.avg - x.avg);
 return `<h1>Leaderboard</h1><p class="sub">Ranked by total points (1 point per correct answer).</p>
 <div class="table-wrap"><table>
 <tr><th>Rank</th><th>Student</th><th>Quizzes taken</th><th>Average</th><th>Points</th></tr>
 ${board.map((b, i) => `<tr><td>${i + 1}</td><td>${esc(b.name)}${b.you ? ' <span class="ok">(you)</span>' : ''}</td><td>${b.taken}</td><td>${b.avg}%</td><td><strong>${b.points}</strong></td></tr>`).join('')}
 </table></div><p class="muted">Demo only: the other rows are sample data.</p>`;
 },
 instructions() {
 return `<h1>Instructions</h1><p class="sub">Read these rules before you begin.</p><div class="list">
 <div class="card" style="margin-bottom:.8rem"><h3>Timing</h3><p>Each question gets ${TIME_PER_Q} seconds. The quiz is submitted automatically when the timer reaches zero.</p></div>
 <div class="card" style="margin-bottom:.8rem"><h3>Answering</h3><p>Select one option per question. You can move between questions and change an answer before you submit.</p></div>
 <div class="card" style="margin-bottom:.8rem"><h3>Scoring</h3><p>Each correct answer earns one mark and there is no negative marking. A score of ${PASS}% or more is a pass.</p></div>
 <div class="card"><h3>Review</h3><p>After submitting, the correct answers are shown. You may retake any quiz; every attempt is kept.</p></div></div>`;
 }
};
/* ---------- navigation ---------- */
const TITLES = { dashboard:'Dashboard', profile:'Profile', quizzes:'Quizzes', results:'My Results', leaderboard:'Leaderboard', instructions:'Instructions' };
const NAVKEY = { quiz:'quizzes', review:'results' };
function buildNav() {
 $('#nav').innerHTML = Object.entries(TITLES).map(([k, v]) => `<a href="#${k}" data-p="${k}">${v}</a>`).join('');
}
function route() {
 if (!me) return;
 const [h, arg] = location.hash.slice(1).split('/');
 const p = pages[h] ? h : 'dashboard';
 if (p !== 'quiz') stopRun();
 $('#view').innerHTML = pages[p](arg);
 document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.p === (NAVKEY[p] || p)));
 document.querySelectorAll('.ro input').forEach(i => i.readOnly = true);
 const pf = $('#profile-form');
 if (pf) pf.onsubmit = e => {
 e.preventDefault();
 Object.assign(me, { name: $('#p-name').value.trim() || me.name, phone: $('#p-phone').value, dob: $('#p-dob').value, address: $('#p-address').value });
 persist();
 $('#saved').textContent = 'Saved';
 };
}
window.addEventListener('hashchange', route);
/* button actions (answer, previous/next, submit) */
$('#view').addEventListener('click', e => {
 const b = e.target.closest('button'); if (!b || !run) return;
 if (b.dataset.opt !== undefined) run.answers[run.i] = +b.dataset.opt;
 else if (b.dataset.go) run.i += +b.dataset.go;
 else if (b.dataset.submit) {
 const left = run.answers.filter(a => a < 0).length;
 if (left && !confirm(left + ' question(s) unanswered. Submit anyway?')) return;
 return submitRun();
 } else return;
 route();
});
/* ---------- start ---------- */
const s = load('quiz_session', null);
if (s && users.some(u => u.email === s)) login(s);
else $('#auth').classList.remove('hidden');
