// Isi dengan Project URL dan anon/public key dari Supabase.
const SUPABASE_URL = 'https://bbrgxxmgivoqnexfxpgf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lvRhj2MlUkJVRCJpkP8biA_Y6JSzSDX';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
let adminUser = null;
let votersCache = [];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function say(id, t) { $(id).textContent = t || ''; }
function page(title, html) { $('pageTitle').textContent = title; $('content').innerHTML = html; document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.page === ({ Ringkasan: 'overview', 'Data Pemilih': 'voters', 'Pasangan Calon': 'candidates', 'Hasil Suara': 'results', Pengaturan: 'settings' }[title]))); }
async function guard() { const { data: { user } } = await db.auth.getUser(); if (!user) {
    $('login').hidden = false;
    $('app').hidden = true;
    return;
} const { data: p } = await db.from('profiles').select('role,full_name').eq('id', user.id).maybeSingle(); if (p?.role !== 'admin') {
    await db.auth.signOut();
    $('login').hidden = false;
    say('loginMsg', 'Akun ini tidak memiliki hak administrator.');
    return;
} adminUser = p; $('login').hidden = true; $('app').hidden = false; $('nav').hidden = false; await overview(); }
$('loginForm').onsubmit = async (e) => { e.preventDefault(); say('loginMsg', 'Memeriksa akses...'); const { error } = await db.auth.signInWithPassword({ email: $('email').value, password: $('password').value }); if (error) {
    say('loginMsg', 'Login gagal. Periksa email dan kata sandi.');
    return;
} await guard(); };
$('logout').onclick = async () => { await db.auth.signOut(); location.reload(); };
document.querySelectorAll('nav button').forEach(b => b.onclick = () => ({ overview, voters, candidates, results, settings }[b.dataset.page])());
async function overview() { const [{ count: total }, { count: voted }, { data: setting }] = await Promise.all([db.from('voters').select('*', { count: 'exact', head: true }), db.from('voters').select('*', { count: 'exact', head: true }).eq('has_voted', true), db.from('election_settings').select('*').eq('id', 1).single()]); page('Ringkasan', `<div class="stats"><div class="stat"><span>Total pemilih terdaftar</span><strong>${total ?? 0}</strong></div><div class="stat"><span>Sudah menggunakan hak suara</span><strong>${voted ?? 0}</strong></div><div class="stat"><span>Status pemilihan</span><strong style="font-size:22px">${setting?.is_open ? 'DIBUKA' : 'DITUTUP'}</strong></div></div><div class="card"><h2>Selamat datang di Admin Pilketos</h2><p class="muted">Kelola data pemilih, pasangan calon, dan pantau rekapitulasi suara dari satu tempat. Website ini terpisah dari halaman pemilihan.</p><p class="hint">Pastikan data pemilih dan pasangan calon sudah benar sebelum membuka pemilihan.</p></div>`); }
async function voters() { const { data, error } = await db.from('voters').select('*').order('full_name'); if (error) {
    page('Data Pemilih', `<div class="card">${esc(error.message)}</div>`);
    return;
} votersCache = data || []; page('Data Pemilih', `<div class="card"><div class="card-head"><h2>Tambah pemilih manual</h2></div><form id="addVoter"><div class="form-grid"><label>NIS / NIP<input name="identifier" required></label><label>Nama lengkap<input name="full_name" required></label><label>Status<select name="voter_type"><option value="murid">Murid</option><option value="guru">Guru</option></select></label><label>Jenis kelamin<select name="gender"><option value="">—</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label><label>Jurusan<select name="major"><option value="">—</option>${['LP', 'TKR', 'TOI', 'TSM', 'TKJ', 'DPIB'].map(x => `<option>${x}</option>`).join('')}</select></label><label>Kelas<select name="grade"><option value="">—</option>${['X', 'XI', 'XII'].map(x => `<option>${x}</option>`).join('')}</select></label></div><button class="primary">Simpan pemilih</button><p id="addMsg" class="message"></p></form></div><div class="card"><div class="card-head"><h2>Impor CSV</h2><span class="hint">Password awal otomatis NIS/NIP</span></div><input id="csvFile" type="file" accept=".csv,text/csv"><div class="actions"><button id="importCsv" class="primary">Impor data CSV</button><button id="sampleCsv" class="ghost">Unduh contoh CSV</button></div><p class="hint">Header: identifier,full_name,gender,major,grade,status. Status isi murid atau guru.</p><p id="csvMsg" class="message"></p></div><div class="card"><div class="card-head"><h2>Daftar pemilih (${data?.length || 0})</h2><input id="searchVoter" placeholder="Cari nama / NIS / kelas" style="max-width:260px;margin:0"></div><div class="table-wrap"><table><thead><tr><th>NIS/NIP</th><th>Nama</th><th>Status</th><th>Kelas</th><th>Jurusan</th><th>Hak suara</th></tr></thead><tbody id="voterRows">${voterRows(data || [])}</tbody></table></div></div>`); $('addVoter').onsubmit = addVoter; $('searchVoter').oninput = () => { $('voterRows').innerHTML = voterRows(votersCache.filter(v => [v.identifier, v.full_name, v.grade, v.major].join(' ').toLowerCase().includes($('searchVoter').value.toLowerCase()))); }; $('importCsv').onclick = importCsv; $('sampleCsv').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['identifier,full_name,gender,major,grade,status\n123456,ANDI,L,TKJ,X,murid\n1987654321,BUDI,,,,guru\n'], { type: 'text/csv' })); a.download = 'contoh-pemilih.csv'; a.click(); }; }
function voterRows(rows) { return rows.map(v => `<tr><td>${esc(v.identifier)}</td><td>${esc(v.full_name)}</td><td>${esc(v.voter_type)}</td><td>${esc(v.grade || '—')}</td><td>${esc(v.major || '—')}</td><td><span class="pill ${v.has_voted ? '' : 'off'}">${v.has_voted ? 'Sudah memilih' : 'Belum memilih'}</span></td></tr>`).join(''); }
async function callProvision(rows) { const { data: { session } } = await db.auth.getSession(); const res = await fetch(`${SUPABASE_URL}/functions/v1/provision-voters`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPABASE_ANON_KEY }, body: JSON.stringify({ voters: rows }) }); const out = await res.json(); if (!res.ok)
    throw new Error(out.error || 'Gagal menyimpan data'); return out; }
async function addVoter(e) { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.full_name = f.full_name.trim().toUpperCase(); if (f.voter_type === 'guru') {
    f.major = null;
    f.grade = null;
    f.gender = null;
} try {
    say('addMsg', 'Menyimpan...');
    const r = await callProvision([f]);
    say('addMsg', r.message || 'Data berhasil disimpan.');
    await voters();
}
catch (err) {
    say('addMsg', err.message);
} }
async function importCsv() { const file = $('csvFile').files[0]; if (!file) {
    say('csvMsg', 'Pilih file CSV terlebih dahulu.');
    return;
} try {
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const headers = lines.shift().split(',').map(x => x.trim().toLowerCase());
    const rows = lines.filter(Boolean).map(line => { const cols = line.split(',').map(x => x.trim()); return Object.fromEntries(headers.map((h, i) => [h, cols[i] || ''])); });
    say('csvMsg', `Mengimpor ${rows.length} data...`);
    const r = await callProvision(rows);
    say('csvMsg', r.message || 'Impor selesai.');
    await voters();
}
catch (err) {
    say('csvMsg', err.message);
} }
async function candidates() { const { data, error } = await db.from('candidates').select('*').order('number'); page('Pasangan Calon', `<div class="card"><h2>Tambah / perbarui pasangan calon</h2><form id="candidateForm"><div class="form-grid"><label>Nomor paslon<select name="number" required><option value="1">Paslon 1</option><option value="2">Paslon 2</option><option value="3">Paslon 3</option></select></label><label>Nama pasangan<input name="name" required placeholder="Contoh: Sifa & Ahmad"></label><label class="full">Nama lengkap dan kelas<input name="members" required placeholder="Nama 1 (kelas) · Nama 2 (kelas)"></label><label class="full">Path foto / URL foto<input name="photo_url" placeholder="assets/paslon-1.jpg"></label><label class="full">Visi<textarea name="vision" required></textarea></label><label class="full">Misi<textarea name="mission" required placeholder="Tuliskan poin-poin misi"></textarea></label></div><button class="primary">Simpan pasangan calon</button><p id="candidateMsg" class="message"></p></form></div><div class="card"><h2>Daftar pasangan calon</h2><div id="candidateList">${(data || []).map(c => `<div class="candidate-row"><img src="${esc(c.photo_url || '')}" onerror="this.style.visibility='hidden'"><div><b>Paslon ${c.number} · ${esc(c.name)}</b><p>${esc(c.members)}</p><span class="pill ${c.is_active ? '' : 'off'}">${c.is_active ? 'Aktif' : 'Nonaktif'}</span></div><button class="ghost editCandidate" data-id="${c.id}">Edit</button></div>`).join('') || '<p class="hint">Belum ada kandidat.</p>'}</div></div>`); $('candidateForm').onsubmit = saveCandidate; document.querySelectorAll('.editCandidate').forEach(b => b.onclick = () => { const c = data.find(x => x.id === b.dataset.id), f = $('candidateForm'); Object.entries(c).forEach(([k, v]) => { if (f.elements[k])
    f.elements[k].value = v ?? ''; }); f.dataset.id = c.id; window.scrollTo({ top: 0, behavior: 'smooth' }); }); }
async function saveCandidate(e) {
    e.preventDefault();

    const f = e.target;
    const d = Object.fromEntries(new FormData(f));

    d.number = Number(d.number);

    const id = f.dataset.id;

    let q;

    if (id) {
        // Memperbarui kandidat yang sudah ada
        q = db
            .from('candidates')
            .update(d)
            .eq('id', id);
    } else {
        // Menambahkan kandidat baru
        q = db
            .from('candidates')
            .insert(d);
    }

    const { error } = await q;

    if (error) {
        say('candidateMsg', error.message);
        return;
    }

    f.reset();
    delete f.dataset.id;

    await candidates();
}

async function results() {
    const { data, error } = await db.rpc('admin_vote_summary');

    const { count: total, error: totalError } = await db
        .from('voters')
        .select('*', { count: 'exact', head: true });

    if (error) {
        page('Hasil Suara', `
            <div class="card">
                <h2>Rekapitulasi Suara</h2>
                <p class="message">${esc(error.message)}</p>
            </div>
        `);
        return;
    }

    if (totalError) {
        console.error('Gagal membaca jumlah pemilih:', totalError);
    }

    const candidates = data || [];
    const votes = candidates.reduce(
        (n, x) => n + Number(x.total_votes || 0),
        0
    );

    const candidateHTML = candidates.map(x => {
        const count = Number(x.total_votes || 0);
        const percentage = votes
            ? Math.round(count / votes * 100)
            : 0;

        return `
            <div style="margin:22px 0">
                <div class="card-head">
                    <b>Paslon ${x.candidate_number} · ${esc(x.candidate_name)}</b>
                    <b>${count} suara (${percentage}%)</b>
                </div>
                <div class="bar">
                    <i style="width:${percentage}%"></i>
                </div>
            </div>
        `;
    }).join('');

    page('Hasil Suara', `
        <div class="stats">
            <div class="stat">
                <span>Total suara masuk</span>
                <strong>${votes}</strong>
            </div>

            <div class="stat">
                <span>Total pemilih terdaftar</span>
                <strong>${total ?? 0}</strong>
            </div>

            <div class="stat">
                <span>Partisipasi</span>
                <strong>${total ? Math.round(votes / total * 100) : 0}%</strong>
            </div>
        </div>

        <div class="card">
            <h2>Rekapitulasi Suara</h2>
            ${candidateHTML || '<p class="hint">Belum ada data kandidat.</p>'}
        </div>

        <p class="hint">
            Rekap hanya menampilkan jumlah suara per pasangan calon.
            Sistem tidak menyediakan akses admin untuk menghubungkan
            pilihan dengan identitas pemilih.
        </p>
    `);
}

async function settings() { const { data: s } = await db.from('election_settings').select('*').eq('id', 1).single(); page('Pengaturan', `<div class="card"><h2>Pengaturan pemilihan</h2><form id="settingsForm"><label>Judul pemilihan<input name="title" value="${esc(s?.title || 'PEMILIHAN KETUA OSIS')}" required></label><label>Status pemilihan<select name="is_open"><option value="false" ${s?.is_open ? '' : 'selected'}>Ditutup</option><option value="true" ${s?.is_open ? 'selected' : ''}>Dibuka</option></select></label><button class="primary">Simpan pengaturan</button><p id="settingsMsg" class="message"></p></form></div><div class="card"><h2>Zona berbahaya</h2><p class="hint">Reset akan menghapus seluruh suara dan mengembalikan status semua pemilih menjadi belum memilih. Gunakan hanya untuk pengujian sebelum pemilihan resmi.</p><button id="resetVotes" class="danger">Reset seluruh suara</button><p id="resetMsg" class="message"></p></div>`); $('settingsForm').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.is_open = f.is_open === 'true'; const { data, error } = await db
    .from('election_settings')
    .update({
        ...f,
        updated_at: new Date().toISOString()
    })
    .eq('id', 1)
    .select('id, is_open')
    .maybeSingle();

if (error) {
    say('settingsMsg', 'Gagal menyimpan: ' + error.message);
    return;
}

if (!data) {
    say('settingsMsg', 'Tidak ada data yang diperbarui. Periksa izin admin dan ID pengaturan.');
    return;
}

say(
    'settingsMsg',
    data.is_open
        ? 'Pemilihan berhasil DIBUKA.'
        : 'Pemilihan berhasil DITUTUP.'
); }; $('resetVotes').onclick = async () => { if (!confirm('Yakin reset SEMUA suara? Tindakan ini tidak dapat dibatalkan.'))
    return; const { error } = await db.rpc('admin_reset_votes'); say('resetMsg', error?.message || 'Data suara berhasil direset.'); }; }
if (SUPABASE_URL.startsWith('https://'))
    guard();
else
    say('loginMsg', 'Konfigurasi Supabase belum diisi. Buka app.js dan isi URL serta anon key.');
