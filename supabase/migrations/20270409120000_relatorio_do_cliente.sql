-- Relatório por cliente (10/11/2026; claude/plano-planos-empresa-e-agencia.md, etapa 2, recurso 2). Rode depois de
-- 20270408120000_finalistas_com_a_marca.sql. Pode rodar de novo.
--
-- A agência com o Plano Agência (ou a cortesia) vê, por cliente e por período, o trabalho feito: as vagas, quantos
-- candidatos chegaram, quantos atendem o obrigatório pela Triagem, quantos foram a entrevista, os finalistas, o
-- tempo até os primeiros finalistas e os contratados. Manda ao cliente por um link sem conta, com a marca dela, para
-- ver ou salvar em PDF. Só números: nenhum nome nem contato de candidato sai no relatório.

-- 1. O link do cliente (um por cliente; trocar invalida o anterior)
create table if not exists public.links_relatorio (
  cliente_id uuid primary key references public.clientes_agencia (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now(),
  aberto_em timestamptz,
  aberturas integer not null default 0
);
alter table public.links_relatorio enable row level security;
revoke all on public.links_relatorio from public, anon, authenticated;

-- 2. Os números de um cliente no período (de quem já foi conferido: a agência dona, com o plano)
create or replace function privado.numeros_do_cliente(p_cliente uuid, p_de date, p_ate date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select a.id, a.titulo, a.status, a.criado_em, a.preenchida_em
      from public.anuncios a
     where a.cliente_id = p_cliente and a.tipo = 'vaga' and a.status <> 'removido'
       and a.criado_em::date between p_de and p_ate
  ), n as (
    select v.id, v.titulo, v.status, v.criado_em, v.preenchida_em,
           (select count(*) from public.curtidas c where c.anuncio_id = v.id) as candidatos,
           (select count(*) from privado.copiloto_avaliacoes t where t.anuncio_id = v.id and t.obrigatorios_ok) as triagem,
           (select count(*) from public.etapas_candidatos e where e.anuncio_id = v.id and e.etapa = 'entrevista') as entrevista,
           (select count(*) from public.finalistas f where f.anuncio_id = v.id) as finalistas,
           (select count(*) from public.finalistas f where f.anuncio_id = v.id and f.decisao is not null) as respondidos,
           (select count(*) from public.etapas_candidatos e where e.anuncio_id = v.id and e.etapa = 'contratado') as contratados,
           (select extract(epoch from min(f.criado_em) - v.criado_em) / 86400.0
              from public.finalistas f where f.anuncio_id = v.id) as dias_finalistas
      from v
  )
  select jsonb_build_object(
    'de', p_de,
    'ate', p_ate,
    'totais', jsonb_build_object(
      'vagas', (select count(*) from n),
      'candidatos', coalesce((select sum(candidatos) from n), 0),
      'triagem', coalesce((select sum(triagem) from n), 0),
      'entrevista', coalesce((select sum(entrevista) from n), 0),
      'finalistas', coalesce((select sum(finalistas) from n), 0),
      'respondidos', coalesce((select sum(respondidos) from n), 0),
      'contratados', coalesce((select sum(contratados) from n), 0),
      'dias_finalistas', (select round(percentile_cont(0.5) within group (order by dias_finalistas)::numeric, 1)
                            from n where dias_finalistas is not null)),
    'vagas', coalesce((select jsonb_agg(jsonb_build_object(
               'titulo', titulo, 'status', status, 'criado_em', criado_em, 'preenchida_em', preenchida_em,
               'candidatos', candidatos, 'triagem', triagem, 'entrevista', entrevista, 'finalistas', finalistas,
               'contratados', contratados,
               'dias_finalistas', case when dias_finalistas is null then null else round(dias_finalistas::numeric, 1) end)
             order by criado_em desc) from n), '[]'::jsonb))
$$;
revoke execute on function privado.numeros_do_cliente(uuid, date, date) from public, anon, authenticated;

-- o cabeçalho: o cliente e a agência (com a marca da Página de carreiras)
create or replace function privado.cabecalho_do_relatorio(p_cliente uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'cliente', c.nome,
    'agencia', jsonb_build_object('nome', p.nome, 'foto', p.foto, 'verificado', p.verificado),
    'marca', (select jsonb_build_object('cor', g.cor, 'foto', coalesce((to_jsonb(g) -> 'fotos' ->> 0), g.capa))
                from public.paginas_de_vagas g where g.conta_id = c.agencia_id))
    from public.clientes_agencia c
    join public.perfis p on p.id = c.agencia_id
   where c.id = p_cliente
$$;
revoke execute on function privado.cabecalho_do_relatorio(uuid) from public, anon, authenticated;

-- 3. A agência: o relatório no painel (só com o plano) e o link para o cliente
create or replace function public.relatorio_do_cliente(p_cliente uuid, p_de date, p_ate date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  de date := coalesce(p_de, (now() at time zone 'America/Sao_Paulo')::date - 89);
  ate date := coalesce(p_ate, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clientes_agencia c where c.id = p_cliente and c.agencia_id = conta) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if not privado.agencia_com_plano(conta) then
    return jsonb_build_object('liberado', false);
  end if;
  if ate < de or ate - de > 731 then
    raise exception 'Escolha um período de até 2 anos.' using errcode = '22023';
  end if;
  return privado.cabecalho_do_relatorio(p_cliente) || privado.numeros_do_cliente(p_cliente, de, ate)
         || jsonb_build_object('liberado', true,
                               'token', (select l.token from public.links_relatorio l where l.cliente_id = p_cliente));
end
$$;

-- criar (ou trocar) o link do cliente; devolve o token
create or replace function public.link_do_relatorio(p_cliente uuid, p_trocar boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v_token text;
begin
  if conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin', 'recrutador') then
    raise exception 'Só quem é da equipe da agência cria o link.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clientes_agencia c where c.id = p_cliente and c.agencia_id = conta) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if not privado.agencia_com_plano(conta) then
    raise exception 'O relatório para o cliente é do Plano Agência.' using errcode = 'P0001', hint = 'sem_plano';
  end if;
  insert into public.links_relatorio (cliente_id, token)
  values (p_cliente, encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (cliente_id) do nothing;
  if coalesce(p_trocar, false) then
    update public.links_relatorio set token = encode(extensions.gen_random_bytes(32), 'hex'), criado_em = now(),
                                      aberto_em = null, aberturas = 0
     where cliente_id = p_cliente;
  end if;
  select l.token into v_token from public.links_relatorio l where l.cliente_id = p_cliente;
  return v_token;
end
$$;

-- 4. O cliente, pelo link (sem conta): os últimos 90 dias, ou o período pedido; conta a abertura (não a da
-- própria agência). O plano vencido fecha o link.
create or replace function public.relatorio_por_link(p_token text, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.links_relatorio;
  v_agencia uuid;
  de date := coalesce(p_de, (now() at time zone 'America/Sao_Paulo')::date - 89);
  ate date := coalesce(p_ate, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into l from public.links_relatorio x where x.token = p_token;
  if l.cliente_id is null then
    return null;
  end if;
  select c.agencia_id into v_agencia from public.clientes_agencia c where c.id = l.cliente_id;
  if not privado.agencia_com_plano(v_agencia) then
    return jsonb_build_object('liberado', false) || privado.cabecalho_do_relatorio(l.cliente_id) - 'marca';
  end if;
  if ate < de or ate - de > 731 then
    de := ate - 89;
  end if;
  if v_agencia is distinct from (select public.conta_atual()) then
    update public.links_relatorio set aberto_em = coalesce(aberto_em, now()), aberturas = aberturas + 1
     where cliente_id = l.cliente_id;
  end if;
  return privado.cabecalho_do_relatorio(l.cliente_id) || privado.numeros_do_cliente(l.cliente_id, de, ate)
         || jsonb_build_object('liberado', true, 'previa', v_agencia = (select public.conta_atual()));
end
$$;

revoke execute on function public.relatorio_do_cliente(uuid, date, date), public.link_do_relatorio(uuid, boolean)
  from public, anon;
grant execute on function public.relatorio_do_cliente(uuid, date, date), public.link_do_relatorio(uuid, boolean)
  to authenticated;
revoke execute on function public.relatorio_por_link(text, date, date) from public;
grant execute on function public.relatorio_por_link(text, date, date) to anon, authenticated;

notify pgrst, 'reload schema';
