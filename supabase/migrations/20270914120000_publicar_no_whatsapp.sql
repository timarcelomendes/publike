-- Publicar a vaga dentro do WhatsApp, sem passar pelo site (23/11/2026; Marcelo: "pode", sobre "publicar dentro do
-- WhatsApp: o resumo da vaga com o botão Publicar; a conta é criada pelo número do WhatsApp"). De 19 a 22/11, nenhuma
-- vaga preparada pelo WhatsApp foi publicada: quem respondeu tudo abria o link e parava no entrar e no perfil do site.
-- Agora, com uma vaga só (o anúncio com várias continua pela página do lote), a resposta traz "Sim, publicar":
--   - o número que já entra no Publike (o celular do login) publica na conta dele;
--   - o número sem conta ganha uma, com o login pelo celular (o mesmo do "entrar com o código pelo WhatsApp", migração
--     20270818120000), o perfil de empresa com o nome que ela disser (ou o lido no anúncio) e o WhatsApp no cadastro.
--     O número escrito só no cadastro de outra conta não basta (como no entrar: a junção pede as duas provas, migração
--     20270819120000);
--   - a vaga passa pelas mesmas regras do site (o formulário lido no servidor e os gatilhos de anuncios).
-- Liga e desliga em Admin › Publicar pelo WhatsApp (começa ligado). Pode rodar de novo.

alter table privado.config_whatsapp add column if not exists vagas_publicar_aqui boolean not null default true;

-- a configuração do recurso para o atendimento: agora com o publicar aqui
create or replace function public.servidor_whatsapp_vagas_config(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_whatsapp;
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_whatsapp where id;
  if not found then
    return jsonb_build_object('ligado', false);
  end if;
  return jsonb_build_object(
    'ligado', c.ativo and coalesce(c.atendimento_ligado, false) and c.vagas_ligado,
    'fotos', c.vagas_fotos,
    'pdf', c.vagas_pdf,
    'texto', c.vagas_texto,
    'por_mensagem', c.vagas_por_mensagem,
    'leituras_dia', c.vagas_leituras_dia,
    'confirmar', c.vagas_confirmar,
    'oferecer_avisos', c.vagas_oferecer_avisos,
    'publicar_aqui', c.vagas_publicar_aqui,
    'textos', c.vagas_textos);
end
$$;

-- A conta que publica pelo número: só a que entra com este celular (sem a da equipe do Publike e sem a apagada)
create or replace function privado.conta_do_celular(p_numero text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from auth.users u
   where u.phone = any (privado.numeros_do_whatsapp(p_numero))
     and u.deleted_at is null
     and not coalesce(u.is_anonymous, false)
     and not privado.conta_da_equipe_publike(u.id)
   order by u.created_at
   limit 1
$$;
revoke all on function privado.conta_do_celular(text) from public, anon, authenticated;

-- A vaga para publicar aqui: a do botão (o token) ou, sem ele (a resposta com o nome da empresa), a última da conversa
-- ainda não publicada, das últimas 24 horas. Junto, a conta do número, se já tem.
create or replace function public.servidor_whatsapp_vaga_para_publicar(p_chave text, p_conversa text, p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v privado.whatsapp_vagas;
  v_ligado boolean;
  v_numero text;
  v_conta uuid;
begin
  perform privado.exigir_servidor(p_chave);
  select c.ativo and coalesce(c.atendimento_ligado, false) and c.vagas_ligado and c.vagas_publicar_aqui
    into v_ligado
    from privado.config_whatsapp c where c.id;
  if not coalesce(v_ligado, false) then
    return jsonb_build_object('ligado', false);
  end if;
  if coalesce(p_token, '') <> '' then
    select * into v from privado.whatsapp_vagas x
     where x.token = p_token and x.conversa = p_conversa and x.criado_em > now() - interval '30 days';
  else
    select * into v from privado.whatsapp_vagas x
     where x.conversa = p_conversa and x.publicada_em is null and x.criado_em > now() - interval '24 hours'
     order by x.criado_em desc
     limit 1;
  end if;
  if not found then
    return jsonb_build_object('ligado', true, 'achou', false);
  end if;
  select c.numero into v_numero from privado.whatsapp_conversas c where c.chave = p_conversa;
  v_conta := privado.conta_do_celular(coalesce(v_numero, v.numero));
  return jsonb_build_object(
    'ligado', true,
    'achou', true,
    'token', v.token,
    'rascunho', v.rascunho,
    'empresa', v.empresa,
    'publicada', v.publicada_em is not null,
    'anuncio_id', v.anuncio_id,
    'no_lote', (select count(*) from privado.whatsapp_vagas o where o.lote = v.lote),
    'conta', v_conta,
    'tem_perfil', v_conta is not null and exists (select 1 from public.perfis p where p.id = v_conta));
end
$$;

-- Publica: a conta (a do celular, ou uma nova) e a vaga, numa transação só. `p_registro`: a vaga já conferida pelo
-- formulário do site no servidor (`lerAnuncio`), como o admin publica em nome da conta. Devolve
-- {ok, anuncio_id, conta_nova, restantes} ou {ok: false, erro: 'nao_achou' | 'falta_nome' | 'numero_invalido' |
-- 'suspensa' | 'desligado'}; o erro das regras da vaga (os gatilhos de anuncios) volta como erro do banco.
create or replace function public.servidor_whatsapp_publicar_aqui(
  p_chave text, p_conversa text, p_token text, p_nome text, p_registro jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v privado.whatsapp_vagas;
  v_ligado boolean;
  v_numero text;
  v_tel text;
  v_conta uuid;
  v_nova boolean := false;
  v_nome text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
  v_cidade text := nullif(btrim(coalesce(p_registro ->> 'cidade', '')), '');
  v_bairro text := nullif(btrim(coalesce(p_registro ->> 'bairro', '')), '');
  v_reg jsonb;
  v_colunas text;
  v_anuncio uuid;
begin
  perform privado.exigir_servidor(p_chave);
  select c.ativo and coalesce(c.atendimento_ligado, false) and c.vagas_ligado and c.vagas_publicar_aqui
    into v_ligado
    from privado.config_whatsapp c where c.id;
  if not coalesce(v_ligado, false) then
    return jsonb_build_object('ok', false, 'erro', 'desligado');
  end if;
  if jsonb_typeof(p_registro) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'erro', 'nao_achou');
  end if;
  select * into v from privado.whatsapp_vagas x
   where x.token = p_token and x.conversa = p_conversa and x.criado_em > now() - interval '30 days'
     for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'nao_achou');
  end if;
  -- dois toques no botão: a segunda vez só devolve a vaga
  if v.publicada_em is not null then
    return jsonb_build_object('ok', true, 'ja', true, 'anuncio_id', v.anuncio_id, 'conta_nova', false, 'restantes', 0);
  end if;
  select c.numero into v_numero from privado.whatsapp_conversas c where c.chave = p_conversa;
  v_numero := coalesce(v_numero, v.numero);
  v_tel := privado.telefone_do_login(v_numero);
  if v_tel is null then
    return jsonb_build_object('ok', false, 'erro', 'numero_invalido');
  end if;

  v_conta := privado.conta_do_celular(v_numero);
  if v_conta is not null then
    if exists (select 1 from auth.users u where u.id = v_conta and u.banned_until is not null and u.banned_until > now())
       or exists (select 1 from public.perfis p where p.id = v_conta and p.suspenso_ate is not null and p.suspenso_ate > now()) then
      return jsonb_build_object('ok', false, 'erro', 'suspensa');
    end if;
    -- entrou pelo celular e não terminou o perfil: o perfil de empresa, com o nome que ela disse
    if not exists (select 1 from public.perfis p where p.id = v_conta) then
      if v_nome is null then
        return jsonb_build_object('ok', false, 'erro', 'falta_nome');
      end if;
      insert into public.perfis (id, nome, tipo, cidade, bairro)
      values (v_conta, v_nome, 'empresa', coalesce(v_cidade, 'Goiânia'), v_bairro);
      insert into public.contatos (perfil_id, whatsapp) values (v_conta, v_tel) on conflict (perfil_id) do nothing;
    end if;
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
    insert into public.perfis (id, nome, tipo, cidade, bairro)
    values (v_conta, v_nome, 'empresa', coalesce(v_cidade, 'Goiânia'), v_bairro);
    insert into public.contatos (perfil_id, whatsapp) values (v_conta, v_tel);
    v_nova := true;
  end if;

  -- a vaga: só as colunas de anuncios que o formulário manda (o resto fica com o padrão e os gatilhos)
  select jsonb_object_agg(e.key, e.value) into v_reg
    from jsonb_each(p_registro) e
   where e.key in (select c.column_name::text from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = 'anuncios')
     and e.key not in ('id', 'autor_id', 'tipo', 'status', 'criado_em', 'atualizado_em', 'expira_em',
                       'nota_moderacao', 'status_anterior', 'fotos');
  v_reg := coalesce(v_reg, '{}'::jsonb) || jsonb_build_object('autor_id', v_conta, 'tipo', 'vaga');
  select string_agg(quote_ident(k), ', ') into v_colunas from jsonb_object_keys(v_reg) k;
  execute format('insert into public.anuncios (%1$s) select %1$s from jsonb_populate_record(null::public.anuncios, $1) returning id',
                 v_colunas)
     into v_anuncio
    using v_reg;

  update privado.whatsapp_vagas x
     set publicada_em = now(), anuncio_id = v_anuncio, conta_id = v_conta, aberta_em = coalesce(x.aberta_em, now())
   where x.id = v.id;
  return jsonb_build_object(
    'ok', true,
    'anuncio_id', v_anuncio,
    'conta_nova', v_nova,
    'restantes', (select count(*) from privado.whatsapp_vagas o where o.lote = v.lote and o.publicada_em is null));
end
$$;
revoke execute on function public.servidor_whatsapp_vaga_para_publicar(text, text, text),
  public.servidor_whatsapp_publicar_aqui(text, text, text, text, jsonb) from public;
grant execute on function public.servidor_whatsapp_vaga_para_publicar(text, text, text),
  public.servidor_whatsapp_publicar_aqui(text, text, text, text, jsonb) to anon, authenticated, service_role;

-- O Admin (no computador do dono e, no site, a equipe publike.org)
create or replace function public.admin_whatsapp_publicar_aqui()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return (select c.vagas_publicar_aqui from privado.config_whatsapp c where c.id);
end
$$;

create or replace function public.admin_salvar_whatsapp_publicar_aqui(p_ligado boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  update privado.config_whatsapp
     set vagas_publicar_aqui = coalesce(p_ligado, vagas_publicar_aqui), atualizado_em = now(), atualizado_por = auth.uid()
   where id;
end
$$;
revoke execute on function public.admin_whatsapp_publicar_aqui(), public.admin_salvar_whatsapp_publicar_aqui(boolean)
  from public, anon;
grant execute on function public.admin_whatsapp_publicar_aqui(), public.admin_salvar_whatsapp_publicar_aqui(boolean)
  to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270914120000_publicar_no_whatsapp');
