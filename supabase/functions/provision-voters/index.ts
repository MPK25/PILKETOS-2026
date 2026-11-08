import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

type VoterRow = {
  identifier?: unknown;
  full_name?: unknown;
  voter_type?: unknown;
  status?: unknown;
  major?: unknown;
  grade?: unknown;
  gender?: unknown;
};

type AuthLookupResult = {
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null;
  lookupFailed: boolean;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS');

    if (!url || !secretKeysRaw) {
      console.error('Supabase URL atau secret keys tidak tersedia.');
      return json({ error: 'Konfigurasi server belum lengkap' }, 500);
    }

    let secretKeys: Record<string, string>;
    try {
      secretKeys = JSON.parse(secretKeysRaw);
    } catch {
      console.error('Format SUPABASE_SECRET_KEYS tidak valid.');
      return json({ error: 'Konfigurasi secret server tidak valid' }, 500);
    }

    const service = secretKeys.default;
    if (!service) {
      console.error('Secret key default tidak ditemukan.');
      return json({ error: 'Secret key server tidak ditemukan' }, 500);
    }

    const authorization = req.headers.get('Authorization') ?? '';
    const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);

    if (!bearerMatch) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const caller = createClient(url, service);
    const token = bearerMatch[1].trim();

    const {
      data: { user },
      error: authErr,
    } = await caller.auth.getUser(token);

    if (authErr || !user) {
      return json({ error: 'Sesi tidak valid' }, 401);
    }

    const { data: adminProfile, error: adminProfileErr } = await caller
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (adminProfileErr || adminProfile?.role !== 'admin') {
      return json({ error: 'Hanya admin yang dapat mengelola pemilih' }, 403);
    }

    let body: { voters?: VoterRow[] };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Format JSON tidak valid' }, 400);
    }

    const rows = body?.voters;
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 1000) {
      return json({ error: 'Data harus berupa array (1–1000 baris)' }, 400);
    }

    const allowedMajors = ['LP', 'TKR', 'TOI', 'TSM', 'TKJ', 'DPIB'];
    const allowedGrades = ['X', 'XI', 'XII'];
    const seenIdentifiers = new Set<string>();

    let success = 0;
    const errors: string[] = [];

    /*
     * Pemindaian seluruh akun Auth hanya dilakukan jika createUser gagal.
     * Dengan begitu, impor normal tidak melakukan listUsers berulang kali.
     * Ini juga membantu menemukan akun Auth yatim yang mungkin tertinggal
     * dari proses impor sebelumnya.
     */
    const findAuthUserByEmail = async (
      email: string,
      identifier: string,
    ): Promise<AuthLookupResult> => {
      const perPage = 1000;
      let page = 1;

      while (true) {
        const { data, error } = await caller.auth.admin.listUsers({
          page,
          perPage,
        });

        if (error || !data) {
          return { user: null, lookupFailed: true };
        }

        const found = data.users.find(
          (candidate) => candidate.email?.toLowerCase() === email,
        );

        if (found) {
          const metadataIdentifier = String(
            found.user_metadata?.identifier ?? '',
          ).trim().toLowerCase();

          // Jangan mengambil alih akun lain yang kebetulan memakai email sama.
          if (metadataIdentifier !== identifier.toLowerCase()) {
            return { user: null, lookupFailed: false };
          }

          return { user: found, lookupFailed: false };
        }

        if (data.users.length < perPage) {
          return { user: null, lookupFailed: false };
        }

        page += 1;
      }
    };

    const deleteCreatedAuthUser = async (userId: string) => {
      const { error } = await caller.auth.admin.deleteUser(userId);
      if (error) {
        console.error('Pembersihan akun Auth baru gagal:', error.message);
      }
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? {};
      const identifier = String(row.identifier ?? '').trim().toUpperCase();
      const full_name = String(row.full_name ?? '').trim().toUpperCase();
      const voter_type = String(
        row.voter_type ?? row.status ?? 'murid',
      ).trim().toLowerCase();

      if (
        !/^[A-Z0-9.-]{3,30}$/.test(identifier) ||
        !full_name ||
        !['murid', 'guru'].includes(voter_type)
      ) {
        errors.push(`Baris ${i + 2}: NIS/NIP, nama, atau status tidak valid`);
        continue;
      }

      const normalizedIdentifier = identifier.toLowerCase();

      if (seenIdentifiers.has(normalizedIdentifier)) {
        errors.push(`Baris ${i + 2}: NIS/NIP duplikat dalam file import`);
        continue;
      }
      seenIdentifiers.add(normalizedIdentifier);

      const major =
        voter_type === 'guru'
          ? null
          : String(row.major ?? '').trim().toUpperCase();

      const grade =
        voter_type === 'guru'
          ? null
          : String(row.grade ?? '').trim().toUpperCase();

      const gender =
        voter_type === 'guru'
          ? null
          : String(row.gender ?? '').trim().toUpperCase() || null;

      if (
        voter_type === 'murid' &&
        (!allowedMajors.includes(major!) || !allowedGrades.includes(grade!))
      ) {
        errors.push(`Baris ${i + 2}: jurusan atau kelas siswa tidak valid`);
        continue;
      }

      if (gender && !['L', 'P'].includes(gender)) {
        errors.push(`Baris ${i + 2}: jenis kelamin harus L atau P`);
        continue;
      }

      const email = `${normalizedIdentifier}@pemilih.smk.sch.id`;

      // Periksa profil lebih dahulu agar akun yang sudah terdaftar tidak dibuat ulang.
      const { data: existingProfile, error: profileLookupErr } = await caller
        .from('profiles')
        .select('id, role, identifier, full_name, voter_type')
        .eq('identifier', identifier)
        .maybeSingle();

      if (profileLookupErr) {
        errors.push(`Baris ${i + 2}: gagal memeriksa profil pemilih`);
        continue;
      }

      let userId: string | null = null;
      let authUserCreated = false;
      const profileAlreadyExisted = Boolean(existingProfile);

      if (existingProfile) {
        if (existingProfile.role !== 'user') {
          errors.push(`Baris ${i + 2}: identifier terhubung ke akun non-pemilih`);
          continue;
        }

        userId = existingProfile.id;
      } else {
        // Coba buat akun langsung. Pencarian Auth hanya menjadi fallback.
        const { data: created, error: createErr } =
          await caller.auth.admin.createUser({
            email,
            password: identifier,
            email_confirm: true,
            user_metadata: { identifier, full_name },
          });

        if (createErr || !created.user) {
          const retry = await findAuthUserByEmail(email, identifier);

          if (retry.lookupFailed) {
            errors.push(`Baris ${i + 2}: gagal memeriksa akun Auth`);
            continue;
          }

          if (retry.user) {
            userId = retry.user.id;
          } else {
            console.error('Gagal membuat akun pemilih:', createErr?.message);
            errors.push(
              `Baris ${i + 2}: akun gagal dibuat atau perlu pemeriksaan admin`,
            );
            continue;
          }
        } else {
          userId = created.user.id;
          authUserCreated = true;
        }
      }

      if (!userId) {
        errors.push(`Baris ${i + 2}: ID akun tidak ditemukan`);
        continue;
      }

      const { error: pErr } = await caller.from('profiles').upsert(
        {
          id: userId,
          identifier,
          full_name,
          role: 'user',
          voter_type,
        },
        { onConflict: 'id' },
      );

      if (pErr) {
        if (authUserCreated) {
          await deleteCreatedAuthUser(userId);
        }

        console.error('Gagal menyimpan profil pemilih:', pErr.message);
        errors.push(`Baris ${i + 2}: gagal menyimpan profil pemilih`);
        continue;
      }

      const { error: vErr } = await caller.from('voters').upsert(
        {
          user_id: userId,
          identifier,
          full_name,
          gender,
          major,
          grade,
          voter_type,
          is_active: true,
        },
        { onConflict: 'user_id' },
      );

      if (vErr) {
        /*
         * Tidak ada transaksi tunggal yang mencakup Supabase Auth dan dua tabel.
         * Karena itu, lakukan kompensasi jika penyimpanan voters gagal:
         * pulihkan profil lama atau hapus profil baru, lalu hapus akun Auth
         * jika akun tersebut baru dibuat pada baris ini.
         */
        if (profileAlreadyExisted && existingProfile) {
          const { error: restoreErr } = await caller
            .from('profiles')
            .update({
              identifier: existingProfile.identifier,
              full_name: existingProfile.full_name,
              role: existingProfile.role,
              voter_type: existingProfile.voter_type,
            })
            .eq('id', userId);

          if (restoreErr) {
            console.error('Pemulihan profil lama gagal:', restoreErr.message);
          }
        } else {
          const { error: deleteProfileErr } = await caller
            .from('profiles')
            .delete()
            .eq('id', userId);

          if (deleteProfileErr) {
            console.error('Pembersihan profil baru gagal:', deleteProfileErr.message);
          }
        }

        if (authUserCreated) {
          await deleteCreatedAuthUser(userId);
        }

        console.error('Gagal menyimpan data pemilih:', vErr.message);
        errors.push(`Baris ${i + 2}: gagal menyimpan data pemilih`);
        continue;
      }

      success++;
    }

    return json({
      success,
      errors,
      message: `Berhasil memproses ${success} dari ${rows.length} data.${
        errors.length
          ? ` Ada ${errors.length} baris yang perlu diperiksa.`
          : ''
      }`,
    });
  } catch (error) {
    console.error('Provision voters error:', error);
    return json(
      { error: 'Terjadi kesalahan server saat memproses pemilih' },
      500,
    );
  }
});
