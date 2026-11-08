// Isi dengan Project URL dan anon/public key dari Supabase.
const SUPABASE_URL = 'https://bbrgxxmgivoqnexfxpgf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lvRhj2MlUkJVRCJpkP8biA_Y6JSzSDX';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
let selectedCandidate = null;
const internalEmail = id => `${id.trim().toLowerCase()}@pemilih.smk.sch.id`;
function show(view) { ['loginView', 'voteView', 'thanksView'].forEach(id => $(id).hidden = id !== view);
}
function message(id, text) { $(id).textContent = text || '';
}
async function loadVoter() { const { data: { user } } = await db.auth.getUser();
if (!user) {
    show('loginView');
    return;
} const { data: voter, error } = await db.from('voters').select('full_name,voter_type,has_voted,is_active,grade,major').eq('user_id', user.id).maybeSingle();
if (error || !voter || !voter.is_active) {
    await db.auth.signOut();
    show('loginView');
    message('loginMsg', 'Akun tidak ditemukan atau tidak aktif. Hubungi panitia.');
    return;
} if (voter.has_voted) {
    show('thanksView');
    return;
} $('welcomeText').textContent = `Selamat datang, ${voter.full_name}. Pilih dengan bijak.`;
show('voteView');
await loadCandidates();
}
async function loadCandidates() { const [{ data: candidates, error: cErr }, { data: settings }] = await Promise.all([db.from('candidates').select('*').eq('is_active', true).order('number'), db.from('election_settings').select('is_open').eq('id', 1).single()]);
if (cErr) {
    message('voteMsg', 'Gagal memuat pasangan calon.');
    return;
} const open = !!settings?.is_open;
$('closedBanner').hidden = open;
const grid = $('candidateGrid');
grid.innerHTML = '';
(candidates || []).forEach(c => { const card = document.createElement('article'); card.className = 'candidate'; const img = document.createElement('img'); img.src = c.photo_url || 'assets/paslon-placeholder.jpg'; img.alt = `Foto Paslon ${c.number}`; img.onerror = () => { img.style.display = 'none'; }; const body = document.createElement('div'); body.className = 'candidate-body'; body.innerHTML = `<div class="number">PASANGAN CALON ${c.number}</div><h2></h2><div class="members"></div><details><summary>Lihat visi & misi</summary><p><b>Visi</b><br><span class="vision"></span></p><p><b>Misi</b><br><span class="mission"></span></p></details><button class="primary" ${open ? '' : 'disabled'}>Pilih pasangan ini</button>`; body.querySelector('h2').textContent = c.name; body.querySelector('.members').textContent = c.members; body.querySelector('.vision').textContent = c.vision; body.querySelector('.mission').textContent = c.mission; body.querySelector('button').addEventListener('click', () => { selectedCandidate = c.id; $('confirmDialog').showModal(); }); card.append(img, body); grid.append(card); });
if (!candidates?.length)
    message('voteMsg', 'Pasangan calon belum ditambahkan oleh panitia.');
}
$('loginForm').addEventListener('submit', async (e) => { e.preventDefault(); message('loginMsg', 'Memeriksa akun...'); const id = $('identifier').value.trim(), password = $('password').value; if (!id || !password)
    return; const { error } = await db.auth.signInWithPassword({ email: internalEmail(id), password }); if (error) {
    message('loginMsg', 'Login gagal. Periksa NIS/NIP dan kata sandi.');
    return;
} message('loginMsg', ''); await loadVoter(); });
$('cancelVote').onclick = () => $('confirmDialog').close();
$('confirmVote').onclick = async () => { if (!selectedCandidate)
    return;
const btn = $('confirmVote');
btn.disabled = true;
btn.textContent = 'Mengirim...';
const { error } = await db.rpc('cast_vote', { p_candidate_id: selectedCandidate });
$('confirmDialog').close();
btn.disabled = false;
btn.textContent = 'Ya, kirim suara';
if (error) {
    message('voteMsg', error.message);
    return;
} show('thanksView');
};
$('logoutBtn').onclick = async () => { await db.auth.signOut();
show('loginView');
};
$('finishBtn').onclick = async () => { await db.auth.signOut();
$('loginForm').reset();
show('loginView');
};
db.auth.onAuthStateChange((_event, session) => { if (!session)
    show('loginView'); });
if (SUPABASE_URL.startsWith('https://'))
    loadVoter();
else
    message('loginMsg', 'Konfigurasi Supabase belum diisi. Buka app.js dan isi URL serta anon key.');
