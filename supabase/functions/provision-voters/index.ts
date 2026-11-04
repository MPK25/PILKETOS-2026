import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS')
        return new Response('ok', { headers: cors });
    if (req.method !== 'POST')
        return json({ error: 'Method not allowed' }, 405);
    const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth = req.headers.get('Authorization');
    if (!auth)
        return json({ error: 'Unauthorized' }, 401);
    const caller = createClient(url, service);
    const token = auth.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await caller.auth.getUser(token);
    if (authErr || !user)
        return json({ error: 'Sesi tidak valid' }, 401);
    const { data: profile } = await caller.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin')
        return json({ error: 'Hanya admin yang dapat mengelola pemilih' }, 403);
    try {
        const body = await req.json();
        const rows = body.voters;
        if (!Array.isArray(rows) || rows.length < 1 || rows.length > 1000)
            return json({ error: 'Data harus berupa array (1–1000 baris)' }, 400);
        const allowedMajors = ['LP', 'TKR', 'TOI', 'TSM', 'TKJ', 'DPIB'], allowedGrades = ['X', 'XI', 'XII'];
        let success = 0;
        const errors: string[] = [];
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i], identifier = String(r.identifier || '').trim(), full_name = String(r.full_name || '').trim().toUpperCase(), voter_type = String(r.voter_type || r.status || 'murid').trim().toLowerCase();
            if (!/^[A-Za-z0-9.-]{3,30}$/.test(identifier) || !full_name || !['murid', 'guru'].includes(voter_type)) {
                errors.push(`Baris ${i + 2}: NIS/NIP, nama, atau status tidak valid`);
                continue;
            }
            const major = voter_type === 'guru' ? null : String(r.major || '').trim().toUpperCase(), grade = voter_type === 'guru' ? null : String(r.grade || '').trim().toUpperCase(), gender = voter_type === 'guru' ? null : (String(r.gender || '').trim().toUpperCase() || null);
            if (voter_type === 'murid' && (!allowedMajors.includes(major) || !allowedGrades.includes(grade))) {
                errors.push(`Baris ${i + 2}: jurusan atau kelas siswa tidak valid`);
                continue;
            }
            if (gender && !['L', 'P'].includes(gender)) {
                errors.push(`Baris ${i + 2}: jenis kelamin harus L atau P`);
                continue;
            }
            const email = `${identifier.trim().toLowerCase()}@pemilih.smk.sch.id`;
            const { data: created, error: createErr } = await caller.auth.admin.createUser({ email, password: identifier, email_confirm: true, user_metadata: { identifier, full_name } });
            let userId = created.user?.id;
            if (createErr) {
                const { data: list } = await caller.auth.admin.listUsers({ page: 1, perPage: 1000 });
                const existing = list.users.find(u => u.email === email);
                if (existing) {
                    userId = existing.id;
                    await caller.auth.admin.updateUserById(userId, { password: identifier, email_confirm: true });
                }
                else {
                    errors.push(`Baris ${i + 2}: ${createErr.message}`);
                    continue;
                }
            }
            const { error: pErr } = await caller.from('profiles').upsert({ id: userId, identifier, full_name, role: 'user', voter_type }, { onConflict: 'id' });
            const { error: vErr } = await caller.from('voters').upsert({ user_id: userId, identifier, full_name, gender, major, grade, voter_type, is_active: true }, { onConflict: 'user_id' });
            if (pErr || vErr) {
                errors.push(`Baris ${i + 2}: ${pErr?.message || vErr?.message}`);
                continue;
            }
            success++;
        }
        return json({ success, errors, message: `Berhasil memproses ${success} dari ${rows.length} data.${errors.length ? ' Ada ' + errors.length + ' baris yang perlu diperiksa.' : ''}` });
    }
    catch (e) {
        return json({ error: e instanceof Error ? e.message : 'Kesalahan server' }, 500);
    }
});
