-- "Quero trabalhar aqui" nos lugares da Rota do currículo e do "Abriu perto de você" (15/11/2026, Marcelo: "quero que
-- tenha uma opção, quero demonstrar interesse; se a empresa for usuária do publike.org, ela já recebe uma notificação;
-- se não, chamar no WhatsApp ou ligar ou traçar rota").
--   * contato_do_lugar: se a empresa já está no Publike (pelo CNPJ da conta, matriz ou filial) e, se não, o telefone
--     da Receita (só de empresa; o MEI nunca entra nesses lugares) e o ponto para traçar a rota;
--   * demonstrar_interesse: a empresa no Publike recebe o aviso 'interesse_local' (sino, celular e e-mail), com o
--     currículo de quem demonstrou; uma vez por lugar e até 20 por dia.
-- Pode rodar de novo.

create table if not exists privado.interesses_locais (
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  cnpj text not null,
  conta_id uuid references public.perfis (id) on delete set null,
  criado_em timestamptz not null default now(),
  primary key (perfil_id, cnpj)
);
create index if not exists interesses_locais_conta_idx on privado.interesses_locais (conta_id, criado_em desc);
alter table privado.interesses_locais enable row level security;
revoke all on privado.interesses_locais from public, anon, authenticated;

-- 1. O aviso novo 'interesse_local' (para quem contrata, no grupo do andamento; sino, celular e e-mail) ------------

do $$
declare
  d text;
  f text;
  t text;
  antes text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'public.notificacoes'::regclass and c.conname = 'notificacoes_tipo_check';
  if strpos(d, '''interesse_local''') = 0 then
    if strpos(d, '''rota_pergunta''::text') = 0 then
      raise exception 'notificacoes_tipo_check sem rota_pergunta (rode antes a 20270606120000): %', d;
    end if;
    d := replace(d, '''rota_pergunta''::text', '''rota_pergunta''::text, ''interesse_local''::text');
    alter table public.notificacoes drop constraint notificacoes_tipo_check;
    execute 'alter table public.notificacoes add constraint notificacoes_tipo_check ' || d;
  end if;

  f := pg_get_functiondef('privado.grupo_do_aviso(text)'::regprocedure);
  if strpos(f, '''interesse_local''') = 0 then
    antes := f;
    f := replace(f, '''rota_pergunta'') then ''andamento''', '''rota_pergunta'', ''interesse_local'') then ''andamento''');
    if f = antes then
      raise exception 'privado.grupo_do_aviso mudou: não achei o rota_pergunta';
    end if;
    execute f;
  end if;

  f := pg_get_functiondef('privado.notificacao_por_email()'::regprocedure);
  if strpos(f, '''interesse_local''') = 0 then
    antes := f;
    f := replace(f, '''copia_aberta'', ''rota_pergunta'') then', '''copia_aberta'', ''rota_pergunta'', ''interesse_local'') then');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei a lista do motivo';
    end if;
    antes := f;
    f := replace(f, 'when ''copia_aberta'' then coalesce(new.link, ''/rota-do-curriculo'')',
                 'when ''copia_aberta'' then coalesce(new.link, ''/rota-do-curriculo'')'
                 || chr(10) || '                 when ''interesse_local'' then coalesce(new.link, ''/talentos'')');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei o caminho do copia_aberta';
    end if;
    execute f;
  end if;

  select pg_get_triggerdef(g.oid) into t from pg_trigger g
   where g.tgrelid = 'public.notificacoes'::regclass and g.tgname = 'notificacoes_para_celular';
  if strpos(t, '''interesse_local''') = 0 then
    if strpos(t, '''rota_pergunta''::text]') = 0 then
      raise exception 'notificacoes_para_celular mudou: %', t;
    end if;
    t := replace(t, '''rota_pergunta''::text]', '''rota_pergunta''::text, ''interesse_local''::text]');
    drop trigger notificacoes_para_celular on public.notificacoes;
    execute t;
  end if;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('interesse_local', 'usuarios', 60, 'Alguém quer trabalhar aí',
     'Para quem contrata: uma pessoa da região tocou em "Quero trabalhar aqui" na Rota do currículo ou no "Abriu perto de você".',
     array['nome', 'motivo', 'link'],
     'Alguém perto de vocês quer trabalhar aí',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver o currículo')
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

-- 2. O contato do lugar: no Publike? Se não, o telefone da Receita e o ponto (só empresa, nunca MEI) -------------------

create or replace function privado.conta_do_cnpj(p_cnpj text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- a conta com o mesmo CNPJ ou, sem ela, uma da mesma empresa (matriz e filiais têm a mesma raiz)
  select p.id
    from public.perfis p
   where p.cnpj is not null and p.tipo <> 'pessoa'
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
     and (p.cnpj = p_cnpj or left(p.cnpj, 8) = left(p_cnpj, 8))
   order by (p.cnpj = p_cnpj) desc, p.criado_em
   limit 1
$$;
revoke all on function privado.conta_do_cnpj(text) from public;

create or replace function public.contato_do_lugar(p_cnpj text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e record;
  v_tel text;
begin
  if coalesce(p_cnpj, '') !~ '^[0-9A-Z]{12}[0-9]{2}$' then
    return null;
  end if;
  select x.nome, x.telefone, x.logradouro, x.numero, x.bairro, x.cidade, x.cep,
         extensions.st_y(x.local::extensions.geometry) as lat, extensions.st_x(x.local::extensions.geometry) as lng
    into e
    from privado.empresas_receita x
   where x.cnpj = p_cnpj and x.situacao = 'ativa' and not x.mei;
  if not found then
    return null;
  end if;
  v_tel := nullif(regexp_replace(coalesce(e.telefone, ''), '\D', '', 'g'), '');
  return jsonb_build_object(
    'no_publike', privado.conta_do_cnpj(p_cnpj) is not null,
    'ja_demonstrou', auth.uid() is not null and exists (
       select 1 from privado.interesses_locais i where i.perfil_id = auth.uid() and i.cnpj = p_cnpj),
    'telefone', case when length(v_tel) in (10, 11) then v_tel end,
    'celular', length(v_tel) = 11 and substr(v_tel, 3, 1) = '9',
    'endereco', concat_ws(', ', nullif(concat_ws(', ', e.logradouro, e.numero), ''), e.bairro, e.cidade),
    'lat', e.lat, 'lng', e.lng);
end
$$;
revoke execute on function public.contato_do_lugar(text) from public;
grant execute on function public.contato_do_lugar(text) to anon, authenticated, service_role;

-- 3. "Quero trabalhar aqui": a empresa no Publike recebe o aviso -----------------------------------------------------

create or replace function public.demonstrar_interesse(p_cnpj text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_eu uuid := auth.uid();
  v_conta uuid;
  v_lugar text;
  v_nome text;
  v_funcao text;
begin
  if v_eu is null then
    raise exception 'Entre para demonstrar interesse.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perfis p where p.id = v_eu and p.tipo = 'pessoa') then
    raise exception 'Só quem procura trabalho demonstra interesse.' using errcode = '42501';
  end if;
  select x.nome into v_lugar from privado.empresas_receita x
   where x.cnpj = p_cnpj and x.situacao = 'ativa' and not x.mei;
  if v_lugar is null then
    raise exception 'Esse lugar não está na base.' using errcode = '22023';
  end if;
  v_conta := privado.conta_do_cnpj(p_cnpj);
  if exists (select 1 from privado.interesses_locais i where i.perfil_id = v_eu and i.cnpj = p_cnpj) then
    return jsonb_build_object('avisada', v_conta is not null, 'ja', true);
  end if;
  if v_conta is not null and (select count(*) from privado.interesses_locais i
                                where i.perfil_id = v_eu and i.conta_id is not null
                                  and i.criado_em > now() - interval '1 day') >= 20 then
    raise exception 'Você já demonstrou interesse em muitos lugares hoje. Amanhã dá de novo.' using errcode = '54000';
  end if;
  insert into privado.interesses_locais (perfil_id, cnpj, conta_id) values (v_eu, p_cnpj, v_conta);
  if v_conta is not null then
    select privado.nome_para_email(v_eu) into v_nome;
    select nullif(btrim(c.titulo), '') into v_funcao from public.curriculos c where c.perfil_id = v_eu;
    insert into public.notificacoes (destinatario_id, tipo, ator_id, texto, link)
    values (v_conta, 'interesse_local', v_eu,
            coalesce(nullif(btrim(v_nome), ''), 'Uma pessoa da região')
              || coalesce(' (' || lower(v_funcao) || ')', '')
              || ' quer trabalhar com vocês e mandou o currículo pelo Publike.',
            '/talentos/' || v_eu);
  end if;
  return jsonb_build_object('avisada', v_conta is not null, 'ja', false);
end
$$;
revoke execute on function public.demonstrar_interesse(text) from public, anon;
grant execute on function public.demonstrar_interesse(text) to authenticated, service_role;

notify pgrst, 'reload schema';
