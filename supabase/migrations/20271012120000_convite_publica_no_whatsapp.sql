-- O convite pelo WhatsApp oficial publica com um toque (26/11/2026; Marcelo: "o 2 pode ser mais automático possível,
-- já pedir pra conferir na própria mensagem do WhatsApp e confirmar e informar: sua conta foi criada no Publike,
-- acesse e acompanhe, e já deixe a opção de aceite de acompanhamento no WhatsApp habilitado"; e, sobre o e-mail: "da
-- maneira ideal, sim"). Pode rodar de novo.
--
-- 1. O convite em lote (migração 20271011120000, ainda desligado) leva a vaga escrita na própria mensagem e o botão
--    "Publicar a vaga": antes de sair, o convite vira a vaga preparada da conversa (privado.whatsapp_vagas, com o
--    convite_id), e o toque segue o "Sim, publicar" de sempre (servidor_whatsapp_publicar_aqui: a conta pelo número).
-- 2. Publicada a vaga do convite (pelo WhatsApp ou pelo site), o convite vira "autorizou", com a conta e a vaga.
-- 3. O e-mail da conta que nasceu pelo WhatsApp: depois de a vaga ir ao ar, o WhatsApp pede (sem obrigar); o e-mail
--    escrito na conversa recebe o link de confirmar (privado.emails_a_confirmar), e só o link aberto põe o e-mail no
--    login (o site, com a chave do Supabase). Sem confirmar, nada muda: o aviso não vai para o e-mail digitado errado.

-- 1. O convite vira a vaga preparada -------------------------------------------------------------------------------

alter table privado.whatsapp_vagas add column if not exists convite_id uuid references public.convites (id) on delete set null;
create index if not exists whatsapp_vagas_convite_idx on privado.whatsapp_vagas (convite_id) where convite_id is not null;

-- a vaga preparada do convite (uma por convite): o token do botão e a vaga, para o resumo na mensagem
create or replace function public.servidor_convite_vaga_whatsapp(p_chave text, p_convite uuid, p_numero text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.convites;
  v privado.whatsapp_vagas;
  v_numero text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from public.convites x where x.id = p_convite;
  if not found or c.rascunho is null or c.status <> 'a_enviar' or v_numero !~ '^55[0-9]{10,11}$' then
    return null;
  end if;
  select * into v from privado.whatsapp_vagas x where x.convite_id = c.id and x.publicada_em is null
   order by x.criado_em desc limit 1;
  if found then
    update privado.whatsapp_vagas x
       set conversa = v_numero, numero = v_numero, rascunho = c.rascunho, empresa = left(c.nome, 120), criado_em = now()
     where x.id = v.id
    returning * into v;
  else
    insert into privado.whatsapp_vagas (lote, ordem, conversa, numero, empresa, rascunho, convite_id)
    values (gen_random_uuid(), 1, v_numero, v_numero, left(c.nome, 120), c.rascunho, c.id)
    returning * into v;
  end if;
  return jsonb_build_object('token', v.token, 'rascunho', v.rascunho);
end
$$;

-- o envio anotado: com a vaga preparada, que passa para o número que a Meta devolveu (o wa_id, às vezes sem o 9)
drop function if exists public.servidor_convite_whatsapp_mandado(text, uuid, text, text, text, text);
create or replace function public.servidor_convite_whatsapp_mandado(p_chave text, p_convite uuid, p_numero text,
  p_wamid text, p_falhou text, p_texto text, p_vaga text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.convites;
  v_numero text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from public.convites x where x.id = p_convite;
  if not found then
    return;
  end if;
  insert into privado.convites_whatsapp_envios (convite_id, numero, wamid, falhou)
  values (c.id, v_numero, left(p_wamid, 200), left(p_falhou, 300));
  if p_falhou is not null then
    update public.convites x set nota = left(coalesce(x.nota || E'\n', '') || 'WhatsApp oficial: ' || p_falhou, 500)
     where x.id = c.id;
    -- a vaga preparada para o envio que não saiu não fica
    delete from privado.whatsapp_vagas w
     where w.token = p_vaga and w.convite_id = c.id and w.publicada_em is null;
    return;
  end if;
  update public.convites x
     set status = 'enviada', enviada_em = now(), enviada_por = 'whatsapp_oficial', mensagem = 'publike'
   where x.id = c.id;
  -- a conversa da empresa (a resposta dela cai no atendimento já com o que recebeu)
  if v_numero <> '' then
    -- sem origem: ela é a do anúncio da Meta (a janela grátis), e o convite é uma mensagem paga
    insert into privado.whatsapp_conversas (chave, numero, nome, perfil)
    values (v_numero, v_numero, left(c.nome, 120), 'contratar')
    on conflict (chave) do nothing;
    if btrim(coalesce(p_texto, '')) <> '' then
      insert into privado.whatsapp_conversa_mensagens (chave, de, texto, wamid)
      values (v_numero, 'robo', left(btrim(p_texto), 4000), left(p_wamid, 200));
      update privado.whatsapp_conversas w set ultima_em = now() where w.chave = v_numero;
    end if;
    update privado.whatsapp_vagas w set conversa = v_numero, numero = v_numero
     where w.token = p_vaga and w.convite_id = c.id and w.publicada_em is null and w.conversa <> v_numero;
  end if;
end
$$;

-- a vaga para publicar diz se veio do convite (o toque liga os avisos e pede o e-mail)
do $$
declare
  f text;
  antes text;
begin
  f := pg_get_functiondef('public.servidor_whatsapp_vaga_para_publicar(text, text, text)'::regprocedure);
  if strpos(f, '''convite''') = 0 then
    antes := f;
    f := replace(f, '''tem_perfil'', v_conta is not null and exists (select 1 from public.perfis p where p.id = v_conta));',
                 '''tem_perfil'', v_conta is not null and exists (select 1 from public.perfis p where p.id = v_conta),'
                 || chr(10) || '    ''convite'', v.convite_id is not null);');
    if f = antes then
      raise exception 'public.servidor_whatsapp_vaga_para_publicar mudou: não achei o tem_perfil';
    end if;
    execute f;
  end if;

  -- o "está no ar" diz se a conta ainda não tem e-mail confirmado (o pedido do e-mail)
  f := pg_get_functiondef('public.servidor_whatsapp_vaga_publicada(text, text)'::regprocedure);
  if strpos(f, '''sem_email''') = 0 then
    antes := f;
    f := replace(f, '''ja_recebe'', exists (select 1 from privado.whatsapp_permissoes w',
                 '''sem_email'', v.conta_id is not null and privado.conta_sem_email(v.conta_id),'
                 || chr(10) || '    ''convite'', v.convite_id is not null,'
                 || chr(10) || '    ''ja_recebe'', exists (select 1 from privado.whatsapp_permissoes w');
    if f = antes then
      raise exception 'public.servidor_whatsapp_vaga_publicada mudou: não achei o ja_recebe';
    end if;
    execute f;
  end if;
end
$$;

-- 2. A vaga do convite publicada: o convite autorizou -----------------------------------------------------------

create or replace function privado.convite_publicado_pelo_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.convites c
     set status = 'autorizou',
         aceite_em = coalesce(c.aceite_em, now()),
         usuario_id = coalesce(c.usuario_id, new.conta_id),
         anuncio_id = coalesce(c.anuncio_id, new.anuncio_id)
   where c.id = new.convite_id and c.status <> 'recusou';
  return null;
end
$$;

drop trigger if exists whatsapp_vagas_convite_publicado on privado.whatsapp_vagas;
create trigger whatsapp_vagas_convite_publicado
  after update of anuncio_id on privado.whatsapp_vagas
  for each row
  when (new.convite_id is not null and new.anuncio_id is not null and old.anuncio_id is distinct from new.anuncio_id)
  execute function privado.convite_publicado_pelo_whatsapp();

-- 3. O e-mail da conta que nasceu pelo WhatsApp ------------------------------------------------------------------

-- a conta sem e-mail de login confirmado (não recebe os avisos por e-mail)
create or replace function privado.conta_sem_email(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from auth.users u
                      where u.id = p_conta and nullif(btrim(u.email::text), '') is not null
                        and u.email_confirmed_at is not null)
$$;

create table if not exists privado.emails_a_confirmar (
  id bigint generated always as identity primary key,
  conta_id uuid not null references auth.users (id) on delete cascade,
  email text not null check (char_length(email) <= 200),
  -- o sha256 do token do link (o token só vai no e-mail)
  impressao text not null unique,
  conversa text,
  criado_em timestamptz not null default now(),
  confirmado_em timestamptz
);
create index if not exists emails_a_confirmar_conta_idx on privado.emails_a_confirmar (conta_id, criado_em);
alter table privado.emails_a_confirmar enable row level security;
revoke all on privado.emails_a_confirmar from public, anon, authenticated;

-- o e-mail de confirmar
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('confirmar_email', 'usuarios', 98, 'Confirmar o e-mail da conta do WhatsApp',
     'A conta que nasceu pelo WhatsApp escreveu o e-mail na conversa (migração 20271012120000): o link põe o e-mail no login e os avisos passam a chegar por e-mail também.',
     array['nome', 'email', 'link'],
     'Confirme seu e-mail no Publike',
     E'Oi, {{nome}}.\n\nVocê escreveu este e-mail ({{email}}) no WhatsApp do Publike. Toque no botão para confirmar: a partir daí, os avisos dos candidatos chegam também por aqui, e você pode entrar no Publike com este e-mail.\n\nSe não foi você, é só ignorar: nada muda na conta.',
     'Confirmar e-mail')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do update
  set nome = excluded.nome, descricao = excluded.descricao, variaveis = excluded.variaveis,
      assunto = case when modelos_email.assunto = modelos_email.assunto_padrao then excluded.assunto
                     else modelos_email.assunto end,
      corpo = case when modelos_email.corpo = modelos_email.corpo_padrao then excluded.corpo
                   else modelos_email.corpo end,
      botao = case when modelos_email.botao = modelos_email.botao_padrao then excluded.botao
                   else modelos_email.botao end,
      assunto_padrao = excluded.assunto_padrao, corpo_padrao = excluded.corpo_padrao,
      botao_padrao = excluded.botao_padrao;

-- o e-mail escrito na conversa: o link de confirmar. situacao: mandado | ja_tem | de_outra | invalido | sem_conta |
-- limite
create or replace function public.servidor_whatsapp_email_da_conta(p_chave text, p_conversa text, p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_numero text;
  v_conta uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_atual text;
begin
  perform privado.exigir_servidor(p_chave);
  if not privado.email_valido(v_email) then
    return jsonb_build_object('situacao', 'invalido');
  end if;
  select c.numero into v_numero from privado.whatsapp_conversas c where c.chave = p_conversa;
  v_conta := privado.conta_do_celular(coalesce(v_numero, p_conversa));
  if v_conta is null then
    return jsonb_build_object('situacao', 'sem_conta');
  end if;
  select nullif(btrim(u.email::text), '') into v_atual
    from auth.users u where u.id = v_conta and u.email_confirmed_at is not null;
  if v_atual is not null then
    return jsonb_build_object('situacao', 'ja_tem', 'email', v_atual);
  end if;
  if exists (select 1 from auth.users u where lower(u.email::text) = v_email and u.id <> v_conta) then
    return jsonb_build_object('situacao', 'de_outra', 'email', v_email);
  end if;
  if (select count(*) from privado.emails_a_confirmar e
       where e.conta_id = v_conta and e.criado_em > now() - interval '1 day') >= 3 then
    return jsonb_build_object('situacao', 'limite', 'email', v_email);
  end if;
  insert into privado.emails_a_confirmar (conta_id, email, impressao, conversa)
  values (v_conta, v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_conversa);
  insert into privado.fila_emails (modelo, para, usuario_id, dados)
  values ('confirmar_email', v_email, v_conta,
          jsonb_build_object('nome', coalesce(privado.nome_para_email(v_conta), ''), 'email', v_email,
                             'caminho', '/confirmar-email/' || v_token));
  return jsonb_build_object('situacao', 'mandado', 'email', v_email);
end
$$;

-- o link de confirmar: o e-mail e a conta (p_usar: marca como confirmado, depois de o site pôr o e-mail no login).
-- situacao: vale | usado | vencido | nao_achou
create or replace function public.servidor_email_a_confirmar(p_chave text, p_token text, p_usar boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e privado.emails_a_confirmar;
begin
  perform privado.exigir_servidor(p_chave);
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('situacao', 'nao_achou');
  end if;
  select * into e from privado.emails_a_confirmar x
   where x.impressao = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('situacao', 'nao_achou');
  end if;
  if e.confirmado_em is not null then
    return jsonb_build_object('situacao', 'usado', 'email', e.email, 'conta', e.conta_id);
  end if;
  if e.criado_em < now() - interval '7 days' then
    return jsonb_build_object('situacao', 'vencido', 'email', e.email);
  end if;
  if coalesce(p_usar, false) then
    update privado.emails_a_confirmar x set confirmado_em = now() where x.id = e.id;
  end if;
  return jsonb_build_object('situacao', 'vale', 'email', e.email, 'conta', e.conta_id);
end
$$;

-- a conta da conversa sem e-mail (o lembrete no "entrar")
create or replace function public.servidor_whatsapp_conta_sem_email(p_chave text, p_conversa text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_numero text;
  v_conta uuid;
begin
  perform privado.exigir_servidor(p_chave);
  select c.numero into v_numero from privado.whatsapp_conversas c where c.chave = p_conversa;
  v_conta := privado.conta_do_celular(coalesce(v_numero, p_conversa));
  return v_conta is not null and privado.conta_sem_email(v_conta);
end
$$;

-- 4. As permissões ---------------------------------------------------------------------------------------------------

revoke execute on function privado.conta_sem_email(uuid) from public, anon, authenticated;
revoke execute on function privado.convite_publicado_pelo_whatsapp() from public, anon, authenticated;
revoke execute on function public.servidor_convite_vaga_whatsapp(text, uuid, text) from public;
grant execute on function public.servidor_convite_vaga_whatsapp(text, uuid, text) to anon, authenticated, service_role;
revoke execute on function public.servidor_convite_whatsapp_mandado(text, uuid, text, text, text, text, text) from public;
grant execute on function public.servidor_convite_whatsapp_mandado(text, uuid, text, text, text, text, text) to anon, authenticated, service_role;
revoke execute on function public.servidor_whatsapp_email_da_conta(text, text, text) from public;
grant execute on function public.servidor_whatsapp_email_da_conta(text, text, text) to anon, authenticated, service_role;
revoke execute on function public.servidor_email_a_confirmar(text, text, boolean) from public;
grant execute on function public.servidor_email_a_confirmar(text, text, boolean) to anon, authenticated, service_role;
revoke execute on function public.servidor_whatsapp_conta_sem_email(text, text) from public;
grant execute on function public.servidor_whatsapp_conta_sem_email(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271012120000_convite_publica_no_whatsapp');
