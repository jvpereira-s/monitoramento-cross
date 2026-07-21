import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são injetadas
// automaticamente pelo Supabase em toda Edge Function — não precisam ser configuradas.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Tem que ficar igual ao domínio sintético usado em src/lib/auth.js no front-end —
// os dois lados resolvem o e-mail da mesma forma a partir do username.
const USERNAME_DOMAIN = 'cross.local';
const USERNAME_RE = /^[a-z0-9._-]+$/;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'Método não suportado.' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';

  // Cliente com o JWT de quem chamou — respeita RLS, só serve pra confirmar que é admin.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Não autenticado.' }, 401);

  const { data: callerProfile, error: profileErr } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profileErr || callerProfile?.role !== 'admin') {
    return json({ error: 'Só administradores podem gerenciar usuários.' }, 403);
  }

  // Cliente com service_role — só usado para as chamadas admin.* que exigem privilégio
  // total (criar/excluir usuário no Auth, trocar senha). Nunca chega ao front-end.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const action = body.action;

  if (action === 'create') {
    const username = String(body.username ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const role = body.role;
    const clienteAssociado = body.cliente_associado ? String(body.cliente_associado).trim() : null;

    if (!USERNAME_RE.test(username)) {
      return json({ error: 'Usuário inválido: use só letras minúsculas, números, ponto, hífen ou underscore.' }, 400);
    }
    if (password.length < 8) {
      return json({ error: 'Senha precisa ter pelo menos 8 caracteres.' }, 400);
    }
    if (role !== 'admin' && role !== 'cliente') {
      return json({ error: 'Papel inválido.' }, 400);
    }
    if (role === 'cliente' && !clienteAssociado) {
      return json({ error: 'Informe o cliente associado.' }, 400);
    }

    const email = `${username}@${USERNAME_DOMAIN}`;
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      return json({ error: `Falha ao criar usuário: ${createErr?.message ?? 'erro desconhecido'}` }, 400);
    }

    const { error: insertErr } = await adminClient.from('profiles').insert({
      id: created.user.id,
      username,
      role,
      cliente_associado: role === 'cliente' ? clienteAssociado : null,
    });
    if (insertErr) {
      // Reverte a criação no Auth se o perfil não puder ser gravado — evita usuário
      // "fantasma" sem perfil associado (ex: username duplicado, que o Auth não checa).
      await adminClient.auth.admin.deleteUser(created.user.id);
      return json({ error: `Falha ao criar perfil: ${insertErr.message}` }, 400);
    }

    return json({ success: true, id: created.user.id });
  }

  if (action === 'delete') {
    const userId = String(body.userId ?? '');
    if (!userId) return json({ error: 'userId é obrigatório.' }, 400);
    if (userId === user.id) return json({ error: 'Você não pode excluir sua própria conta.' }, 400);

    const { data: target } = await adminClient.from('profiles').select('role').eq('id', userId).single();
    if (target?.role === 'admin') {
      const { count } = await adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin');
      if ((count ?? 0) <= 1) return json({ error: 'Não é possível excluir o último administrador.' }, 400);
    }

    // profiles.id referencia auth.users(id) on delete cascade — apagar o usuário no Auth
    // já remove a linha de profiles junto, sem precisar de um delete separado.
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteErr) return json({ error: `Falha ao excluir: ${deleteErr.message}` }, 400);
    return json({ success: true });
  }

  if (action === 'reset_password') {
    const userId = String(body.userId ?? '');
    const password = String(body.password ?? '');
    if (!userId || password.length < 8) {
      return json({ error: 'userId e senha (mín. 8 caracteres) são obrigatórios.' }, 400);
    }
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (updateErr) return json({ error: `Falha ao trocar senha: ${updateErr.message}` }, 400);
    return json({ success: true });
  }

  return json({ error: 'Ação desconhecida.' }, 400);
});
