-- O cliente da agência pede a vaga e acompanha o prazo (08/11/2026; claude/plano-pedido-do-cliente-convites-e-testes.md,
-- partes 3 e 4). Pode rodar de novo.
--
-- 1. links_clientes: um link por cliente, sem conta (token de 64 caracteres). A agência copia, troca ou desliga.
-- 2. pedidos_vaga: o que o cliente pediu, a situação, o prazo combinado ("Finalistas até") e a vaga ligada.
-- 3. O link (sem login): portal_do_cliente (os pedidos e o andamento), portal_pedir_vaga e portal_cancelar_pedido.
--    Até 10 pedidos por dia em cada link. O link só mostra os pedidos e as vagas daquele cliente; os candidatos
--    continuam só no link dos finalistas.
-- 4. A agência: link_do_cliente, pedidos_da_agencia, responder_pedido (aceitar com o prazo, recusar com o motivo,
--    mudar o prazo, ligar a vaga, finalistas enviados, concluir, cancelar).
-- 5. O link dos finalistas criado para a vaga do pedido marca "Finalistas enviados" sozinho.
-- 6. O aviso novo pedido_cliente (sino, celular e e-mail "Pedido de vaga do cliente").

-- 1. O link do cliente ------------------------------------------------------------------------------------------------

create table if not exists public.links_clientes (
  cliente_id uuid primary key references public.clientes_agencia (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  aberto_em timestamptz,
  aberturas integer not null default 0
);
comment on table public.links_clientes is 'O link do cliente da agência (sem conta): pedir vagas e acompanhar. Só pelas funções.';
alter table public.links_clientes enable row level security;
revoke all on public.links_clientes from anon, authenticated;
grant select, insert, update, delete on public.links_clientes to service_role;

-- 2. Os pedidos -------------------------------------------------------------------------------------------------------

create table if not exists public.pedidos_vaga (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_agencia (id) on delete cascade,
  agencia_id uuid not null references public.perfis (id) on delete cascade,
  cargo text not null check (char_length(cargo) between 3 and 90),
  quantidade smallint not null default 1 check (quantidade between 1 and 99),
  salario text check (char_length(salario) <= 80),
  horario text check (char_length(horario) <= 120),
  local text check (char_length(local) <= 160),
  requisitos text check (char_length(requisitos) <= 1500),
  para_quando date,
  observacoes text check (char_length(observacoes) <= 1000),
  quem_pediu text check (char_length(quem_pediu) <= 80),
  situacao text not null default 'recebido'
    check (situacao in ('recebido', 'em_selecao', 'finalistas', 'concluido', 'cancelado', 'recusado')),
  motivo text check (char_length(motivo) <= 300),
  anuncio_id uuid references public.anuncios (id) on delete set null,
  finalistas_ate date,
  finalistas_em timestamptz,
  aceito_em timestamptz,
  encerrado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.pedidos_vaga is 'Os pedidos de vaga que o cliente da agência faz pelo link. Só pelas funções.';
create index if not exists pedidos_vaga_agencia_idx on public.pedidos_vaga (agencia_id, criado_em desc);
create index if not exists pedidos_vaga_cliente_idx on public.pedidos_vaga (cliente_id, criado_em desc);
create index if not exists pedidos_vaga_anuncio_idx on public.pedidos_vaga (anuncio_id) where anuncio_id is not null;
alter table public.pedidos_vaga enable row level security;
revoke all on public.pedidos_vaga from anon, authenticated;
grant select, insert, update, delete on public.pedidos_vaga to service_role;

-- O dia de hoje em Goiânia, e N dias úteis (de segunda a sexta) depois de uma data.
create or replace function privado.hoje_no_brasil()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create or replace function privado.dias_uteis_depois(p_dia date, p_dias integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  d date := p_dia;
  n integer := 0;
begin
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6 then
      n := n + 1;
    end if;
  end loop;
  return d;
end
$$;

-- O cliente e a agência de um link ligado (cliente não arquivado, agência não suspensa), ou nada.
create or replace function privado.cliente_do_token(p_token text, out cliente_id uuid, out agencia_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.agencia_id
    from public.links_clientes l
    join public.clientes_agencia c on c.id = l.cliente_id
    join public.perfis a on a.id = c.agencia_id
   where p_token ~ '^[0-9a-f]{64}$' and l.token = p_token and l.ativo
     and c.arquivado_em is null
     and (a.suspenso_ate is null or a.suspenso_ate < now())
$$;
revoke all on function privado.cliente_do_token(text) from public;

-- O andamento de um pedido, para o cliente e para a agência: a vaga, os números e o prazo.
create or replace function privado.andamento_do_pedido(p public.pedidos_vaga)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'cargo', p.cargo, 'quantidade', p.quantidade, 'salario', p.salario, 'horario', p.horario,
    'local', p.local, 'requisitos', p.requisitos, 'para_quando', p.para_quando, 'observacoes', p.observacoes,
    'quem_pediu', p.quem_pediu, 'situacao', p.situacao, 'motivo', p.motivo, 'finalistas_ate', p.finalistas_ate,
    'finalistas_em', p.finalistas_em, 'aceito_em', p.aceito_em, 'encerrado_em', p.encerrado_em,
    'criado_em', p.criado_em,
    'vaga', case when a.id is null then null else jsonb_build_object(
      'id', a.id, 'titulo', a.titulo,
      'no_ar', a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null,
      'candidatos', (select count(*) from public.curtidas k where k.anuncio_id = a.id and k.status <> 'removido'),
      'finalistas', (select count(*) from public.finalistas f where f.anuncio_id = a.id),
      'entrevistas', (select count(distinct x.perfil_id) from public.entrevistas x where x.anuncio_id = a.id),
      'contratados', (select count(*) from public.etapas_candidatos e where e.anuncio_id = a.id and e.etapa = 'contratado'),
      'link_finalistas', (select lf.token from public.links_finalistas lf
                           where lf.anuncio_id = a.id and lf.expira_em > now()
                             and exists (select 1 from public.finalistas f where f.anuncio_id = a.id))
    ) end)
    from (select 1) um
    left join public.anuncios a on a.id = p.anuncio_id
$$;
revoke all on function privado.andamento_do_pedido(public.pedidos_vaga) from public;

-- 3. O link do cliente (sem login) ------------------------------------------------------------------------------------

create or replace function public.portal_do_cliente(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dono record;
begin
  select * into dono from privado.cliente_do_token(p_token);
  if dono.cliente_id is null then
    return null;
  end if;
  update public.links_clientes set aberto_em = now(), aberturas = aberturas + 1 where cliente_id = dono.cliente_id;
  return jsonb_build_object(
    'hoje', privado.hoje_no_brasil(),
    'agencia', (select jsonb_build_object('nome', a.nome, 'foto', a.foto) from public.perfis a where a.id = dono.agencia_id),
    'cliente', (select jsonb_build_object('nome', c.nome, 'cidade', c.cidade, 'bairro', c.bairro, 'endereco', c.endereco)
                  from public.clientes_agencia c where c.id = dono.cliente_id),
    'pedidos', coalesce((select jsonb_agg(privado.andamento_do_pedido(p) order by p.criado_em desc)
                           from (select * from public.pedidos_vaga p
                                  where p.cliente_id = dono.cliente_id
                                  order by p.criado_em desc limit 50) p), '[]'::jsonb));
end
$$;
revoke execute on function public.portal_do_cliente(text) from public;
grant execute on function public.portal_do_cliente(text) to anon, authenticated;

create or replace function public.portal_pedir_vaga(
  p_token text,
  p_cargo text,
  p_quantidade integer default 1,
  p_salario text default null,
  p_horario text default null,
  p_local text default null,
  p_requisitos text default null,
  p_para_quando date default null,
  p_observacoes text default null,
  p_quem text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  dono record;
  v_cliente text;
  novo uuid;
  t text := btrim(regexp_replace(coalesce(p_cargo, ''), '\s+', ' ', 'g'));
begin
  select * into dono from privado.cliente_do_token(p_token);
  if dono.cliente_id is null then
    raise exception 'Este link não vale mais. Peça um novo à agência.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('publike:pedido:' || dono.cliente_id::text));
  if (select count(*) from public.pedidos_vaga p
       where p.cliente_id = dono.cliente_id and p.criado_em > now() - interval '24 hours') >= 10 then
    raise exception 'Já foram 10 pedidos hoje por este link. Tente de novo amanhã ou fale com a agência.' using errcode = 'P0001';
  end if;
  if char_length(t) < 3 then
    raise exception 'Escreva o cargo da vaga.' using errcode = 'P0001';
  end if;
  if p_para_quando is not null and (p_para_quando < privado.hoje_no_brasil() or p_para_quando > privado.hoje_no_brasil() + 365) then
    raise exception 'Escolha uma data a partir de hoje.' using errcode = 'P0001';
  end if;
  insert into public.pedidos_vaga (cliente_id, agencia_id, cargo, quantidade, salario, horario, local, requisitos,
                                   para_quando, observacoes, quem_pediu)
  values (dono.cliente_id, dono.agencia_id, left(t, 90), least(greatest(coalesce(p_quantidade, 1), 1), 99),
          nullif(left(btrim(coalesce(p_salario, '')), 80), ''), nullif(left(btrim(coalesce(p_horario, '')), 120), ''),
          nullif(left(btrim(coalesce(p_local, '')), 160), ''), nullif(left(btrim(coalesce(p_requisitos, '')), 1500), ''),
          p_para_quando, nullif(left(btrim(coalesce(p_observacoes, '')), 1000), ''),
          nullif(left(btrim(coalesce(p_quem, '')), 80), ''))
  returning id into novo;
  select c.nome into v_cliente from public.clientes_agencia c where c.id = dono.cliente_id;
  insert into public.notificacoes (destinatario_id, tipo, texto, link)
  values (dono.agencia_id, 'pedido_cliente',
          left(v_cliente || ' pediu uma vaga: ' || t
               || case when coalesce(p_quantidade, 1) > 1 then ' (' || least(p_quantidade, 99) || ' pessoas)' else '' end
               || '. Aceite com o prazo ou recuse.', 300),
          '/painel/pedidos?pedido=' || novo);
  return novo;
end
$$;
revoke execute on function public.portal_pedir_vaga(text, text, integer, text, text, text, text, date, text, text) from public;
grant execute on function public.portal_pedir_vaga(text, text, integer, text, text, text, text, date, text, text) to anon, authenticated;

-- O cliente desiste de um pedido que ainda não terminou.
create or replace function public.portal_cancelar_pedido(p_token text, p_pedido uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dono record;
  p public.pedidos_vaga;
begin
  select * into dono from privado.cliente_do_token(p_token);
  if dono.cliente_id is null then
    raise exception 'Este link não vale mais. Peça um novo à agência.' using errcode = 'P0001';
  end if;
  update public.pedidos_vaga x set situacao = 'cancelado', encerrado_em = now(), atualizado_em = now()
   where x.id = p_pedido and x.cliente_id = dono.cliente_id and x.situacao in ('recebido', 'em_selecao')
  returning * into p;
  if p.id is null then
    raise exception 'Este pedido não pode mais ser cancelado.' using errcode = 'P0001';
  end if;
  insert into public.notificacoes (destinatario_id, tipo, texto, link)
  values (dono.agencia_id, 'pedido_cliente',
          left((select c.nome from public.clientes_agencia c where c.id = dono.cliente_id)
               || ' cancelou o pedido: ' || p.cargo || '.', 300),
          '/painel/pedidos?pedido=' || p.id);
end
$$;
revoke execute on function public.portal_cancelar_pedido(text, uuid) from public;
grant execute on function public.portal_cancelar_pedido(text, uuid) to anon, authenticated;

-- 4. A agência --------------------------------------------------------------------------------------------------------

-- O link de um cliente da agência: lê (cria na primeira vez), troca, liga ou desliga.
create or replace function public.link_do_cliente(p_cliente uuid, p_acao text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  l public.links_clientes;
begin
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from public.clientes_agencia c where c.id = p_cliente and c.agencia_id = conta) then
    raise exception 'Cliente não encontrado.' using errcode = '42501';
  end if;
  if p_acao is not null and p_acao not in ('trocar', 'ligar', 'desligar') then
    raise exception 'Pedido inválido.' using errcode = 'P0001';
  end if;
  insert into public.links_clientes (cliente_id, token)
  values (p_cliente, encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (cliente_id) do nothing;
  if p_acao = 'trocar' then
    update public.links_clientes set token = encode(extensions.gen_random_bytes(32), 'hex'), ativo = true,
                                     criado_em = now(), aberto_em = null, aberturas = 0
     where cliente_id = p_cliente;
  elsif p_acao in ('ligar', 'desligar') then
    update public.links_clientes set ativo = (p_acao = 'ligar') where cliente_id = p_cliente;
  end if;
  select * into l from public.links_clientes where cliente_id = p_cliente;
  return jsonb_build_object('token', l.token, 'ativo', l.ativo, 'aberto_em', l.aberto_em, 'aberturas', l.aberturas);
end
$$;
revoke execute on function public.link_do_cliente(uuid, text) from public, anon;
grant execute on function public.link_do_cliente(uuid, text) to authenticated;

-- Os pedidos da agência (de um cliente, ou de todos), com o andamento, e o "no prazo" de cada cliente em 90 dias.
create or replace function public.pedidos_da_agencia(p_cliente uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with meus as (
    select p.* from public.pedidos_vaga p
     where p.agencia_id = (select public.conta_atual())
       and (p_cliente is null or p.cliente_id = p_cliente)
  )
  select jsonb_build_object(
    'hoje', privado.hoje_no_brasil(),
    'pedidos', coalesce((select jsonb_agg(privado.andamento_do_pedido(m)
                                          || jsonb_build_object('cliente_id', m.cliente_id, 'cliente', c.nome)
                                          order by (m.situacao = 'recebido') desc,
                                                   (m.situacao in ('em_selecao', 'finalistas')) desc,
                                                   m.criado_em desc)
                           from (select * from meus order by criado_em desc limit 200) m
                           join public.clientes_agencia c on c.id = m.cliente_id), '[]'::jsonb),
    'no_prazo', coalesce((select jsonb_object_agg(x.cliente_id, jsonb_build_object('no_prazo', x.ok, 'total', x.total))
                            from (select m.cliente_id,
                                         count(*) filter (where m.finalistas_em is not null
                                                          and (m.finalistas_em at time zone 'America/Sao_Paulo')::date <= m.finalistas_ate) as ok,
                                         count(*) as total
                                    from meus m
                                   where m.finalistas_ate is not null
                                     and m.criado_em > now() - interval '90 days'
                                     and (m.finalistas_em is not null or m.finalistas_ate < privado.hoje_no_brasil())
                                     and m.situacao <> 'cancelado'
                                   group by m.cliente_id) x), '{}'::jsonb))
$$;
revoke execute on function public.pedidos_da_agencia(uuid) from public, anon;
grant execute on function public.pedidos_da_agencia(uuid) to authenticated;

-- O que a agência faz com o pedido:
--   aceitar (p_data: "Finalistas até"; sem ela, 7 dias úteis), recusar (p_motivo), prazo (p_data), ligar (p_anuncio:
--   uma vaga da agência), finalistas (enviados agora), concluir, cancelar, reabrir (volta para Em seleção).
create or replace function public.responder_pedido(
  p_pedido uuid,
  p_acao text,
  p_data date default null,
  p_motivo text default null,
  p_anuncio uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  p public.pedidos_vaga;
  v_motivo text := nullif(btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g')), '');
begin
  perform privado.exigir_conta_ativa();
  select * into p from public.pedidos_vaga x where x.id = p_pedido and x.agencia_id = conta for update;
  if p.id is null then
    raise exception 'Pedido não encontrado.' using errcode = '42501';
  end if;
  if p_data is not null and (p_data < privado.hoje_no_brasil() - 1 or p_data > privado.hoje_no_brasil() + 365) then
    raise exception 'Escolha uma data a partir de hoje.' using errcode = 'P0001';
  end if;
  if p_acao = 'aceitar' then
    if p.situacao <> 'recebido' then
      raise exception 'Este pedido já foi respondido.' using errcode = 'P0001';
    end if;
    update public.pedidos_vaga set situacao = 'em_selecao', aceito_em = now(), atualizado_em = now(),
           finalistas_ate = coalesce(p_data, privado.dias_uteis_depois(privado.hoje_no_brasil(), 7))
     where id = p.id;
  elsif p_acao = 'recusar' then
    if p.situacao <> 'recebido' then
      raise exception 'Este pedido já foi respondido.' using errcode = 'P0001';
    end if;
    if v_motivo is null then
      raise exception 'Escreva o motivo: o cliente vê.' using errcode = 'P0001';
    end if;
    update public.pedidos_vaga set situacao = 'recusado', motivo = left(v_motivo, 300), encerrado_em = now(),
           atualizado_em = now()
     where id = p.id;
  elsif p_acao = 'prazo' then
    if p_data is null or p.situacao not in ('recebido', 'em_selecao') then
      raise exception 'Escolha a data do prazo.' using errcode = 'P0001';
    end if;
    update public.pedidos_vaga set finalistas_ate = p_data, atualizado_em = now() where id = p.id;
  elsif p_acao = 'ligar' then
    if p_anuncio is not null and not exists (
      select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = conta and a.tipo = 'vaga') then
      raise exception 'Vaga não encontrada.' using errcode = 'P0001';
    end if;
    update public.pedidos_vaga
       set anuncio_id = p_anuncio, atualizado_em = now(),
           situacao = case when situacao = 'recebido' and p_anuncio is not null then 'em_selecao' else situacao end,
           aceito_em = case when situacao = 'recebido' and p_anuncio is not null then now() else aceito_em end,
           finalistas_ate = case when situacao = 'recebido' and p_anuncio is not null and finalistas_ate is null
                                 then privado.dias_uteis_depois(privado.hoje_no_brasil(), 7) else finalistas_ate end
     where id = p.id;
  elsif p_acao = 'finalistas' then
    if p.situacao not in ('em_selecao', 'finalistas') then
      raise exception 'Aceite o pedido primeiro.' using errcode = 'P0001';
    end if;
    update public.pedidos_vaga set situacao = 'finalistas', finalistas_em = coalesce(finalistas_em, now()),
           atualizado_em = now()
     where id = p.id;
  elsif p_acao in ('concluir', 'cancelar') then
    if p.situacao in ('concluido', 'cancelado', 'recusado') then
      raise exception 'Este pedido já terminou.' using errcode = 'P0001';
    end if;
    update public.pedidos_vaga set situacao = case when p_acao = 'concluir' then 'concluido' else 'cancelado' end,
           encerrado_em = now(), atualizado_em = now(),
           motivo = case when p_acao = 'cancelar' and v_motivo is not null then left(v_motivo, 300) else pedidos_vaga.motivo end
     where id = p.id;
  elsif p_acao = 'reabrir' then
    if p.situacao not in ('concluido', 'cancelado', 'finalistas') then
      raise exception 'Este pedido não pode ser reaberto.' using errcode = 'P0001';
    end if;
    update public.pedidos_vaga set situacao = 'em_selecao', encerrado_em = null, atualizado_em = now(),
           aceito_em = coalesce(aceito_em, now())
     where id = p.id;
  else
    raise exception 'Pedido inválido.' using errcode = 'P0001';
  end if;
  select * into p from public.pedidos_vaga where id = p_pedido;
  return privado.andamento_do_pedido(p);
end
$$;
revoke execute on function public.responder_pedido(uuid, text, date, text, uuid) from public, anon;
grant execute on function public.responder_pedido(uuid, text, date, text, uuid) to authenticated;

-- Os números para o menu e o Hoje: pedidos novos, prazos perto (2 dias ou menos) e atrasados.
create or replace function public.resumo_dos_pedidos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'novos', count(*) filter (where p.situacao = 'recebido'),
    'perto', count(*) filter (where p.situacao = 'em_selecao' and p.finalistas_ate is not null
                               and p.finalistas_ate >= privado.hoje_no_brasil()
                               and p.finalistas_ate <= privado.hoje_no_brasil() + 2),
    'atrasados', count(*) filter (where p.situacao = 'em_selecao' and p.finalistas_ate < privado.hoje_no_brasil()))
    from public.pedidos_vaga p
   where p.agencia_id = (select public.conta_atual())
     and p.situacao in ('recebido', 'em_selecao')
$$;
revoke execute on function public.resumo_dos_pedidos() from public, anon;
grant execute on function public.resumo_dos_pedidos() to authenticated;

-- 5. O link dos finalistas da vaga do pedido: "Finalistas enviados" sozinho ----------------------------------------

create or replace function privado.pedido_com_finalistas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pedidos_vaga
     set situacao = 'finalistas', finalistas_em = coalesce(finalistas_em, now()), atualizado_em = now()
   where anuncio_id = new.anuncio_id and situacao = 'em_selecao';
  return null;
end
$$;
drop trigger if exists pedido_com_finalistas on public.links_finalistas;
create trigger pedido_com_finalistas
  after insert or update of token on public.links_finalistas
  for each row execute function privado.pedido_com_finalistas();


-- 6. O aviso novo: pedido_cliente ------------------------------------------------------------------------------------
-- (as definições de agora, da migração 20270214120000_talento_que_combina.sql, com o tipo novo)

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check CHECK ((tipo = ANY (ARRAY['curtida'::text, 'match'::text, 'em_analise'::text, 'removido'::text, 'liberado'::text, 'avaliacao'::text, 'avaliacao_retida'::text, 'match_desfeito'::text, 'etapa'::text, 'mensagem'::text, 'seguindo'::text, 'recomendacao'::text, 'contratacao'::text, 'entrevista'::text, 'entrevista_resposta'::text, 'aceite_curriculo'::text, 'curriculo_recebido'::text, 'busca'::text, 'convite'::text, 'vaga_preenchida'::text, 'finalistas'::text, 'convite_candidato'::text, 'equipe'::text, 'conexao'::text, 'recado_no_ar'::text, 'recado_retido'::text, 'recado_forca'::text, 'convite_curriculo'::text, 'convite_empresa'::text, 'convite_agencia'::text, 'convite_servicos'::text, 'convite_vitrine'::text, 'curriculo_publico'::text, 'visita'::text, 'visitas_do_dia'::text, 'visitas_novidade'::text, 'avaliacao_liberada'::text, 'avaliacao_removida'::text, 'mensagem_equipe'::text, 'vagas_semana'::text, 'talentos_semana'::text, 'comunicado'::text, 'noticias_do_dia'::text, 'teste_pedido'::text, 'teste_feito'::text, 'lembrete_curtida'::text, 'sem_resposta'::text, 'pagamento'::text, 'dispensada'::text, 'entrevista_lembrete'::text, 'video_pedido'::text, 'video_enviado'::text, 'parados'::text, 'proposta'::text, 'proposta_resposta'::text, 'candidatura_recebida'::text, 'talentos_reativar'::text, 'match_empresa'::text, 'matches_sem_contato'::text, 'respostas_match'::text, 'liberacao'::text, 'talento_combina'::text, 'pedido_cliente'::text])));

CREATE OR REPLACE FUNCTION privado.grupo_do_aviso(p_tipo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_tipo = 'mensagem' then 'mensagens'
    when p_tipo in ('curtida', 'match', 'match_desfeito', 'etapa', 'contratacao', 'entrevista', 'entrevista_resposta',
                    'aceite_curriculo', 'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas',
                    'vaga_preenchida', 'recomendacao', 'avaliacao', 'teste_pedido', 'teste_feito',
                    'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                    'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida',
                    'match_empresa', 'matches_sem_contato', 'respostas_match', 'talento_combina', 'pedido_cliente') then 'andamento'
    when p_tipo = 'conexao' then 'conexoes'
    when p_tipo in ('busca', 'seguindo') then 'vagas_novas'
    when p_tipo in ('vagas_semana', 'talentos_semana', 'talentos_reativar', 'resumo_vagas') then 'semana'
    when p_tipo in ('convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos',
                    'convite_vitrine') then 'convites'
    when p_tipo = 'noticias_do_dia' then 'noticias'
    else null
  end
$function$;

CREATE OR REPLACE FUNCTION privado.notificacao_por_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_titulo text;
  v_nota text;
  v_quem text;
  v_autor uuid;
  v_motivo text;
  v_futuro boolean;
  v_depois text;
  v_entrevista jsonb;
  v_status text;
  v_categoria text;
begin
  select a.titulo, a.nota_moderacao, a.autor_id, a.status, a.categoria into v_titulo, v_nota, v_autor, v_status, v_categoria
    from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into v_quem from public.perfis p where p.id = new.ator_id;
  if new.tipo = 'match_desfeito' then
    select public.rotulo_motivo_desfeito(d.motivo), d.futuro into v_motivo, v_futuro
      from public.matches_desfeitos d
     where d.anuncio_id = new.anuncio_id and d.desfeito_por = new.ator_id
     order by d.id desc limit 1;
    if v_futuro then
      v_depois := coalesce(v_quem, 'A outra pessoa') || ' disse que topa negociar com você em outro momento. '
                  || case when new.destinatario_id = v_autor
                          then 'Se quiser, dá para dar match de novo na lista de interessados.'
                          else 'Se ainda tiver interesse, dá para curtir o anúncio de novo.' end;
    end if;
  end if;
  if new.tipo in ('etapa', 'seguindo', 'recomendacao', 'contratacao', 'entrevista', 'entrevista_resposta', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'liberado', 'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                  'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida',
                  'match_empresa', 'matches_sem_contato', 'respostas_match', 'liberacao', 'talento_combina', 'pedido_cliente') then
    v_motivo := new.texto;
  end if;
  -- entrevista: os dados para o convite de agenda (.ics) que vai anexo no e-mail
  if new.tipo in ('entrevista', 'entrevista_resposta', 'entrevista_lembrete') then
    select jsonb_build_object(
             'id', e.id,
             'quando', e.quando,
             'duracao_min', e.duracao_min,
             'formato', e.formato,
             'local', e.local,
             'obs', e.obs,
             'situacao', e.situacao,
             'atualizado_em', e.atualizado_em,
             'anuncio_id', e.anuncio_id,
             'perfil_id', e.perfil_id,
             'vaga', a.titulo,
             'empresa', pa.nome,
             'candidato', pc.nome,
             'para', case when new.destinatario_id = a.autor_id then 'empresa' else 'candidato' end)
      into v_entrevista
      from public.entrevistas e
      join public.anuncios a on a.id = e.anuncio_id
      join public.perfis pa on pa.id = a.autor_id
      join public.perfis pc on pc.id = e.perfil_id
     where e.anuncio_id = new.anuncio_id
       and e.perfil_id = case when new.destinatario_id = a.autor_id then new.ator_id else new.destinatario_id end
     order by e.atualizado_em desc
     limit 1;
  end if;
  perform privado.enfileirar_email(new.destinatario_id, new.tipo, jsonb_build_object(
    'quem', coalesce(v_quem, 'Alguém'),
    'titulo', coalesce(v_titulo, ''),
    'motivo', coalesce(v_motivo, v_nota, ''),
    'depois', coalesce(v_depois, ''),
    'caminho', case new.tipo
                 -- a ficha de quem curtiu na Caixa de entrada, com o Aceitar e o Dispensar (o serviço volta para o anúncio)
                 when 'curtida' then '/painel/caixa?aba=responder&c=' || new.anuncio_id || ':' || new.ator_id
                 when 'lembrete_curtida' then '/painel/caixa?aba=responder&vaga=' || new.anuncio_id
                 when 'sem_resposta' then '/?tipo=vaga&categoria=' || coalesce(v_categoria, 'outros')
                 when 'dispensada' then '/anuncio/' || new.anuncio_id || '/parecidas'
                 when 'match' then '/painel/matches'
                 when 'match_empresa' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 when 'matches_sem_contato' then '/painel/matches'
                 when 'respostas_match' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 -- a funcionalidade liberada: a página dela (o link vem do banco, só caminho do site)
                 when 'liberacao' then coalesce(new.link, '/painel')
                 -- o candidato que combina: a ficha dele em Talentos
                 when 'talento_combina' then coalesce(new.link, '/talentos')
                 -- o pedido de vaga do cliente da agência: a página dos pedidos
                 when 'pedido_cliente' then coalesce(new.link, '/painel/pedidos')
                 when 'liberado' then
                   case when v_status = 'ativo' then '/anuncio/' || new.anuncio_id else '/painel/anuncios' end
                 when 'removido' then '/privacidade#regras'
                 when 'avaliacao' then '/painel/avaliacoes'
                 when 'avaliacao_retida' then '/privacidade#regras'
                 when 'match_desfeito' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/anuncio/' || new.anuncio_id end
                 when 'etapa' then '/painel/curtidas'
                 when 'mensagem' then coalesce('/painel/conversas/' || new.ator_id, '/painel/conversas')
                 when 'seguindo' then '/anuncio/' || new.anuncio_id
                 when 'busca' then '/anuncio/' || new.anuncio_id
                 when 'convite' then '/anuncio/' || new.anuncio_id
                 when 'vaga_preenchida' then '/?tipo=vaga'
                 when 'recomendacao' then '/perfil/' || new.destinatario_id || '#recomendacoes'
                 when 'contratacao' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/painel/curtidas' end
                 when 'entrevista' then '/anuncio/' || new.anuncio_id
                 when 'entrevista_resposta' then '/painel/anuncio/' || new.anuncio_id || '/quadro'
                 when 'video_pedido' then '/entrevista-video/' || new.anuncio_id
                 when 'video_enviado' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 when 'parados' then '/painel/anuncio/' || new.anuncio_id || '/quadro'
                 when 'proposta' then '/proposta/' || new.anuncio_id
                 when 'candidatura_recebida' then '/painel/curtidas'
                 when 'proposta_resposta' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 when 'entrevista_lembrete' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                        else '/anuncio/' || new.anuncio_id end
                 when 'aceite_curriculo' then '/perfil/curriculo?next=%2Fanuncio%2F' || new.anuncio_id
                 when 'curriculo_recebido' then '/painel/anuncio/' || new.anuncio_id || '#candidato-' || new.ator_id
                 when 'finalistas' then '/painel/anuncio/' || new.anuncio_id || '/finalistas'
                 when 'convite_candidato' then '/painel/anuncio/' || new.anuncio_id || '/convidar'
                 when 'equipe' then '/painel/equipe'
                 when 'conexao' then '/painel/conexoes/' || new.ator_id
                 else '/painel'
               end)
    || case when v_entrevista is null then '{}'::jsonb else jsonb_build_object('entrevista', v_entrevista) end);
  return null;
end
$function$;

drop trigger if exists notificacoes_para_celular on public.notificacoes;
CREATE TRIGGER notificacoes_para_celular AFTER INSERT ON public.notificacoes FOR EACH ROW WHEN ((new.tipo = ANY (ARRAY['curtida'::text, 'match'::text, 'mensagem'::text, 'conexao'::text, 'em_analise'::text, 'removido'::text, 'liberado'::text, 'etapa'::text, 'entrevista'::text, 'entrevista_resposta'::text, 'contratacao'::text, 'aceite_curriculo'::text, 'curriculo_recebido'::text, 'convite'::text, 'convite_candidato'::text, 'finalistas'::text, 'vaga_preenchida'::text, 'seguindo'::text, 'busca'::text, 'avaliacao'::text, 'recado_retido'::text, 'mensagem_equipe'::text, 'equipe'::text, 'vagas_semana'::text, 'talentos_semana'::text, 'noticias_do_dia'::text, 'teste_pedido'::text, 'teste_feito'::text, 'lembrete_curtida'::text, 'sem_resposta'::text, 'pagamento'::text, 'dispensada'::text, 'entrevista_lembrete'::text, 'video_pedido'::text, 'video_enviado'::text, 'parados'::text, 'proposta'::text, 'proposta_resposta'::text, 'candidatura_recebida'::text, 'talentos_reativar'::text, 'match_empresa'::text, 'matches_sem_contato'::text, 'respostas_match'::text, 'liberacao'::text, 'talento_combina'::text, 'pedido_cliente'::text]))) EXECUTE FUNCTION privado.notificacao_para_celular();

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('pedido_cliente', 'usuarios', 6, 'Pedido de vaga do cliente',
     'Para a agência: um cliente pediu uma vaga (ou cancelou um pedido) pelo link do cliente.',
     array['nome', 'motivo', 'link'],
     'Um cliente pediu uma vaga',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver o pedido')
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

notify pgrst, 'reload schema';
