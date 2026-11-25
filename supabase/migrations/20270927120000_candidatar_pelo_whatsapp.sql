-- Candidatar-se pelo WhatsApp (25/11/2026; Marcelo, com o que o mercado já tem: "todos são importantes". A Gupy faz a
-- inscrição em um toque, sem login, com a pré-entrevista na conversa). Depois das vagas da busca, o atendimento manda
-- "Quer se candidatar a alguma?" com um botão por vaga; o toque começa a candidatura (privado.whatsapp_candidaturas):
-- as perguntas da vaga, uma de cada vez, na conversa; o nome, quando o número não tem conta e o nome do WhatsApp não
-- serve; e a curtida, feita pela conta do número (a conta nova de pessoa, com o login pelo celular, como o publicar
-- pelo WhatsApp faz para quem contrata).
--
-- A curtida passa pelas mesmas regras do site: a função age como a conta (request.jwt.claims só nesta transação), e os
-- gatilhos de curtidas conferem a conta ativa, o WhatsApp, o bloqueio, o limite do dia, as perguntas obrigatórias, a
-- vaga do site da empresa e a vaga preenchida; os avisos, o contato direto, as automações e o convite do pacote seguem
-- iguais. Quem se candidata pela conversa aceita os avisos pelo WhatsApp (origem 'whatsapp'), como diz a mensagem.
--
-- Desligar: update privado.config_whatsapp set candidatar_ligado = false.

alter table privado.config_whatsapp add column if not exists candidatar_ligado boolean not null default true;

create table if not exists privado.whatsapp_candidaturas (
  id bigint generated always as identity primary key,
  conversa text not null,
  numero text not null,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  respostas jsonb not null default '{}'::jsonb,
  -- a pergunta da vez (índice em anuncios.perguntas)
  vez integer not null default 0,
  situacao text not null default 'perguntando' check (situacao in ('perguntando', 'feita', 'cancelada')),
  conta_id uuid,
  criado_em timestamptz not null default now(),
  feita_em timestamptz
);
create index if not exists whatsapp_candidaturas_conversa on privado.whatsapp_candidaturas (conversa, criado_em desc);
revoke all on privado.whatsapp_candidaturas from public, anon, authenticated;

-- a conta que o número já tem, para a candidatura (null: nenhuma)
create or replace function privado.conta_para_candidatar(p_numero text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when c is null then jsonb_build_object('existe', false)
         else jsonb_build_object(
           'existe', true,
           'tipo', (select p.tipo from public.perfis p where p.id = c),
           'nome', (select p.nome from public.perfis p where p.id = c),
           'tem_curriculo', exists (select 1 from public.curriculos cv where cv.perfil_id = c))
         end
    from (select privado.conta_do_celular(p_numero) as c) x
$$;
revoke execute on function privado.conta_para_candidatar(text) from public, anon, authenticated;

-- ligada? (o "Quer se candidatar?" só sai com ela)
create or replace function public.servidor_whatsapp_candidatar_ligado(p_chave text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((select c.ativo and coalesce(c.atendimento_ligado, false) and c.candidatar_ligado
                     from privado.config_whatsapp c where c.id), false);
end
$$;
revoke execute on function public.servidor_whatsapp_candidatar_ligado(text) from public;
grant execute on function public.servidor_whatsapp_candidatar_ligado(text) to anon, authenticated, service_role;

-- 1. O toque na vaga: confere a vaga e começa (ou recomeça) a candidatura -------------------------------------------
create or replace function public.servidor_whatsapp_vaga_para_candidatar(p_chave text, p_conversa text, p_anuncio uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ligado boolean;
  a public.anuncios;
  v_numero text;
  v_conta uuid;
  v_ja text;
begin
  perform privado.exigir_servidor(p_chave);
  select c.ativo and coalesce(c.atendimento_ligado, false) and c.candidatar_ligado
    into v_ligado
    from privado.config_whatsapp c where c.id;
  if not coalesce(v_ligado, false) then
    return jsonb_build_object('ligado', false, 'ok', false);
  end if;
  select c.numero into v_numero from privado.whatsapp_conversas c where c.chave = p_conversa;
  if v_numero is null then
    return jsonb_build_object('ligado', true, 'ok', false, 'erro', 'nao_achou');
  end if;
  select * into a from public.anuncios x where x.id = p_anuncio;
  if not found or a.tipo <> 'vaga' or a.status <> 'ativo' or (a.expira_em is not null and a.expira_em < now()) then
    return jsonb_build_object('ligado', true, 'ok', false, 'erro', 'nao_achou');
  end if;
  if a.preenchida_em is not null then
    return jsonb_build_object('ligado', true, 'ok', false, 'erro', 'preenchida', 'titulo', a.titulo);
  end if;
  if a.candidatura = 'site' then
    return jsonb_build_object('ligado', true, 'ok', false, 'erro', 'site', 'titulo', a.titulo);
  end if;
  v_conta := privado.conta_do_celular(v_numero);
  if v_conta = a.autor_id then
    return jsonb_build_object('ligado', true, 'ok', false, 'erro', 'propria', 'titulo', a.titulo);
  end if;
  if v_conta is not null then
    select k.status into v_ja from public.curtidas k where k.anuncio_id = a.id and k.perfil_id = v_conta;
    if v_ja is not null and v_ja <> 'desfeito' then
      return jsonb_build_object('ligado', true, 'ok', false, 'erro', 'ja', 'status', v_ja, 'titulo', a.titulo);
    end if;
  end if;
  -- a candidatura de antes, desta conversa, sai: vale a vaga do último toque
  update privado.whatsapp_candidaturas w set situacao = 'cancelada'
   where w.conversa = p_conversa and w.situacao = 'perguntando';
  insert into privado.whatsapp_candidaturas (conversa, numero, anuncio_id) values (p_conversa, v_numero, a.id);
  return jsonb_build_object(
    'ligado', true,
    'ok', true,
    'titulo', a.titulo,
    'perguntas', coalesce(a.perguntas, '[]'::jsonb),
    'conta', privado.conta_para_candidatar(v_numero));
end
$$;

-- 2. A resposta de uma pergunta (ou o pulo da opcional): guarda e passa para a próxima -------------------------------
create or replace function public.servidor_whatsapp_candidatura_responder(
  p_chave text, p_conversa text, p_pergunta text, p_valor text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  w privado.whatsapp_candidaturas;
  v_valor text := left(btrim(coalesce(p_valor, '')), 500);
begin
  perform privado.exigir_servidor(p_chave);
  select * into w from privado.whatsapp_candidaturas x
   where x.conversa = p_conversa and x.situacao = 'perguntando' and x.criado_em > now() - interval '24 hours'
   order by x.criado_em desc limit 1
     for update;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  update privado.whatsapp_candidaturas x
     set respostas = case when v_valor = '' or coalesce(p_pergunta, '') = '' then x.respostas
                          else x.respostas || jsonb_build_object(p_pergunta, v_valor) end,
         vez = x.vez + 1
   where x.id = w.id
  returning * into w;
  return jsonb_build_object(
    'ok', true,
    'anuncio_id', w.anuncio_id,
    'vez', w.vez,
    'respostas', w.respostas,
    'perguntas', (select coalesce(a.perguntas, '[]'::jsonb) from public.anuncios a where a.id = w.anuncio_id),
    'titulo', (select a.titulo from public.anuncios a where a.id = w.anuncio_id),
    'conta', privado.conta_para_candidatar(w.numero));
end
$$;

-- a candidatura em andamento da conversa (a pergunta da vez), sem mexer
create or replace function public.servidor_whatsapp_candidatura_da_vez(p_chave text, p_conversa text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  w privado.whatsapp_candidaturas;
begin
  perform privado.exigir_servidor(p_chave);
  select * into w from privado.whatsapp_candidaturas x
   where x.conversa = p_conversa and x.situacao = 'perguntando' and x.criado_em > now() - interval '24 hours'
   order by x.criado_em desc limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'anuncio_id', w.anuncio_id,
    'vez', w.vez,
    'respostas', w.respostas,
    'perguntas', (select coalesce(a.perguntas, '[]'::jsonb) from public.anuncios a where a.id = w.anuncio_id),
    'titulo', (select a.titulo from public.anuncios a where a.id = w.anuncio_id),
    'conta', privado.conta_para_candidatar(w.numero));
end
$$;

-- desistir da candidatura em andamento ("cancelar")
create or replace function public.servidor_whatsapp_candidatura_cancelar(p_chave text, p_conversa text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.whatsapp_candidaturas x set situacao = 'cancelada'
   where x.conversa = p_conversa and x.situacao = 'perguntando'
  returning true into v_ok;
  return coalesce(v_ok, false);
end
$$;

-- 3. A curtida: a conta do número (ou a nova), agindo como ela -------------------------------------------------------
create or replace function public.servidor_whatsapp_candidatar(p_chave text, p_conversa text, p_nome text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  w privado.whatsapp_candidaturas;
  a public.anuncios;
  v_tel text;
  v_conta uuid;
  v_nova boolean := false;
  v_nome text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
  v_tipo text;
  v_status text;
  v_cidade text;
  v_estado text;
  v_msg text;
  v_dica text;
begin
  perform privado.exigir_servidor(p_chave);
  select * into w from privado.whatsapp_candidaturas x
   where x.conversa = p_conversa and x.situacao = 'perguntando' and x.criado_em > now() - interval '24 hours'
   order by x.criado_em desc limit 1
     for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'sem_candidatura');
  end if;
  select * into a from public.anuncios x where x.id = w.anuncio_id;
  v_tel := privado.telefone_do_login(w.numero);
  if v_tel is null then
    return jsonb_build_object('ok', false, 'erro', 'numero_invalido');
  end if;
  v_conta := privado.conta_do_celular(w.numero);
  -- a cidade da pessoa: a da vaga, se é das praças (o perfil pede uma cidade)
  v_cidade := coalesce(nullif(btrim(a.cidade), ''), 'Goiânia');

  begin
    if v_conta is not null then
      if exists (select 1 from auth.users u where u.id = v_conta and u.banned_until is not null and u.banned_until > now())
         or exists (select 1 from public.perfis p where p.id = v_conta and p.suspenso_ate is not null and p.suspenso_ate > now()) then
        return jsonb_build_object('ok', false, 'erro', 'suspensa');
      end if;
      select p.tipo into v_tipo from public.perfis p where p.id = v_conta;
      if v_tipo is null then
        -- entrou pelo celular e não terminou o perfil: o perfil de pessoa, com o nome
        if v_nome is null then
          return jsonb_build_object('ok', false, 'erro', 'falta_nome');
        end if;
        insert into public.perfis (id, nome, tipo, cidade) values (v_conta, v_nome, 'pessoa', v_cidade);
        v_tipo := 'pessoa';
      elsif v_tipo <> 'pessoa' then
        return jsonb_build_object('ok', false, 'erro', 'tipo', 'tipo', v_tipo);
      end if;
      insert into public.contatos (perfil_id, whatsapp) values (v_conta, v_tel)
      on conflict (perfil_id) do update set whatsapp = coalesce(public.contatos.whatsapp, excluded.whatsapp);
    else
      if v_nome is null then
        return jsonb_build_object('ok', false, 'erro', 'falta_nome');
      end if;
      -- a conta nova, com o login pelo celular, como o Auth do Supabase cria no entrar pelo código
      v_conta := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
        phone_change, phone_change_token, email_change_token_current, reauthentication_token, is_sso_user, is_anonymous
      ) values (
        '00000000-0000-0000-0000-000000000000', v_conta, 'authenticated', 'authenticated', v_tel, now(),
        jsonb_build_object('provider', 'phone', 'providers', jsonb_build_array('phone')),
        jsonb_build_object('sub', v_conta::text, 'name', v_nome, 'email_verified', false, 'phone_verified', true,
                           'criada_pelo_whatsapp', true),
        now(), now(), '', '', '', '', '', '', '', '', false, false
      );
      insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
      values (v_conta::text, v_conta,
              jsonb_build_object('sub', v_conta::text, 'phone', v_tel, 'email_verified', false, 'phone_verified', true),
              'phone', now(), now());
      insert into public.perfis (id, nome, tipo, cidade) values (v_conta, v_nome, 'pessoa', v_cidade);
      insert into public.contatos (perfil_id, whatsapp) values (v_conta, v_tel);
      v_nova := true;
    end if;

    -- a curtida como a conta: os gatilhos conferem tudo como no site
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_conta, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_conta::text, true);
    insert into public.curtidas (anuncio_id, perfil_id, respostas) values (w.anuncio_id, v_conta, w.respostas);
    select k.status into v_status from public.curtidas k where k.anuncio_id = w.anuncio_id and k.perfil_id = v_conta;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'erro', 'ja');
    when others then
      get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_dica = pg_exception_hint;
      return jsonb_build_object('ok', false, 'erro', coalesce(nullif(v_dica, ''), 'falhou'), 'mensagem', v_msg,
                                'codigo', v_estado);
  end;

  update privado.whatsapp_candidaturas x set situacao = 'feita', feita_em = now(), conta_id = v_conta where x.id = w.id;
  -- os avisos pelo WhatsApp: quem se candidata pela conversa aceita (a mensagem diz, com o PARAR); quem cancelou antes
  -- continua cancelado
  insert into privado.whatsapp_permissoes (conta_id, numero, origem, aceito_em)
  values (v_conta, w.numero, 'whatsapp', now())
  on conflict (conta_id) do nothing;
  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'conta_nova', v_nova,
    'anuncio_id', w.anuncio_id,
    'titulo', a.titulo,
    'tem_curriculo', exists (select 1 from public.curriculos cv where cv.perfil_id = v_conta));
end
$$;

revoke execute on function public.servidor_whatsapp_vaga_para_candidatar(text, text, uuid),
  public.servidor_whatsapp_candidatura_responder(text, text, text, text),
  public.servidor_whatsapp_candidatura_da_vez(text, text),
  public.servidor_whatsapp_candidatura_cancelar(text, text),
  public.servidor_whatsapp_candidatar(text, text, text) from public;
grant execute on function public.servidor_whatsapp_vaga_para_candidatar(text, text, uuid),
  public.servidor_whatsapp_candidatura_responder(text, text, text, text),
  public.servidor_whatsapp_candidatura_da_vez(text, text),
  public.servidor_whatsapp_candidatura_cancelar(text, text),
  public.servidor_whatsapp_candidatar(text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270927120000_candidatar_pelo_whatsapp');
