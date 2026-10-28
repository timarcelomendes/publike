-- Copiloto de contratação, versão de teste (28/10/2026). Pode rodar de novo.
--
-- Só para as contas que o admin liberar (Admin › Usuários › conta). Na vaga, a empresa monta os
-- critérios (a IA sugere), e o copiloto lê os currículos de Talentos e dos candidatos contra eles,
-- com o trecho do currículo como prova. Ele não recusa ninguém: quem decide é a pessoa. O Convidar
-- do copiloto respeita o limite de 3 convites por semana para cada pessoa, somando todas as empresas.
-- "A minha conta" é public.conta_atual() (time de agência); auth.uid() é só a pessoa que clicou.

-- 1. Tabelas ------------------------------------------------------------------------------------

create table if not exists privado.copiloto_contas (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  liberado_em timestamptz not null default now(),
  -- o padrão das próximas vagas
  triagem boolean not null default true,
  busca boolean not null default true
);

create table if not exists privado.copiloto_vagas (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  -- [{id, texto, obrigatorio}]
  criterios jsonb not null default '[]'::jsonb check (
    jsonb_typeof(criterios) = 'array' and jsonb_array_length(criterios) <= 8 and octet_length(criterios::text) <= 4000),
  versao text not null default '',
  triagem boolean not null default true,
  busca boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create table if not exists privado.copiloto_avaliacoes (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  origem text not null check (origem in ('candidato', 'talento')),
  versao text not null,
  curriculo_em timestamptz not null,
  resultado jsonb not null check (jsonb_typeof(resultado) = 'object' and octet_length(resultado::text) <= 8000),
  atende integer not null default 0,
  obrigatorios_ok boolean not null default false,
  modelo text,
  criado_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id)
);

create table if not exists privado.copiloto_registro (
  id bigint generated always as identity primary key,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  pessoa_id uuid references public.perfis (id) on delete set null,
  perfil_id uuid references public.perfis (id) on delete set null,
  acao text not null check (acao in ('criterios', 'ligou', 'avaliou', 'convidou')),
  quantos integer not null default 1,
  detalhe text check (char_length(detalhe) <= 200),
  criado_em timestamptz not null default now()
);
create index if not exists copiloto_registro_vaga on privado.copiloto_registro (anuncio_id, criado_em desc);
create index if not exists convites_vaga_perfil_quando on public.convites_vaga (perfil_id, criado_em desc);

alter table privado.copiloto_contas enable row level security;
alter table privado.copiloto_vagas enable row level security;
alter table privado.copiloto_avaliacoes enable row level security;
alter table privado.copiloto_registro enable row level security;
revoke all on privado.copiloto_contas, privado.copiloto_vagas, privado.copiloto_avaliacoes,
  privado.copiloto_registro from public, anon, authenticated;

alter table privado.limites_uso drop constraint if exists limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check check (acao = any (array[
  'anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao',
  'mensagem', 'seguir', 'recomendacao', 'etapa', 'contratacao', 'ia_resumo', 'convite', 'talento',
  'convite_candidato', 'convite_equipe', 'conexao', 'recado', 'recado_edicao', 'copiloto']));


-- 2. Apoio --------------------------------------------------------------------------------------

create or replace function privado.copiloto_liberado(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.copiloto_contas c where c.conta_id = p_conta)
$$;

-- a mesma lista de motivoProibido (src/lib/copiloto.ts): o que a lei não deixa usar para escolher
create or replace function privado.copiloto_criterio_proibido(p_texto text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_texto ~* ('(\midade\M|\m[0-9]{2} ?(a|e|até) ?[0-9]{2} anos|\m(até|acima de|maior de|menor de) [0-9]{2} anos'
    || '|\mjove(m|ns)\M|\msexo\M|g[eê]nero|\mhomens?\M|\mmulher(es)?\M|masculin|feminin|(?<!venda )\mcasad[oa]s?\M|solteir'
    || '|estado civil|\mfilhos?\M|gr[aá]vida|gravidez|gestante|apar[eê]ncia|religi|cor da pele|\mra[cç]a\M'
    || '|defici[eê]n|\mpcd\M|orienta[cç][aã]o sexual|nacionalidade|\mfotos?\M|nome limpo|\mspc\M|serasa|antecedentes)')
$$;

-- a vaga é da conta atual e a conta está liberada (senão, erro)
create or replace function privado.copiloto_minha_vaga(p_anuncio uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.tipo = 'vaga' and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = 'P0001';
  end if;
  if not privado.copiloto_liberado(public.conta_atual()) then
    raise exception 'O copiloto está em teste e não está liberado para a sua conta.' using errcode = 'P0001',
      hint = 'copiloto_fechado';
  end if;
end
$$;


-- 3. Site -----------------------------------------------------------------------------------------

create or replace function public.copiloto_liberado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and privado.copiloto_liberado(public.conta_atual())
$$;

create or replace function public.copiloto_da_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c privado.copiloto_contas;
  v privado.copiloto_vagas;
begin
  if not exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.tipo = 'vaga' and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = 'P0001';
  end if;
  select * into c from privado.copiloto_contas x where x.conta_id = public.conta_atual();
  if not found then
    return jsonb_build_object('liberado', false);
  end if;
  select * into v from privado.copiloto_vagas x where x.anuncio_id = p_anuncio;
  return jsonb_build_object(
    'liberado', true,
    'criterios', coalesce(v.criterios, '[]'::jsonb),
    'versao', coalesce(v.versao, ''),
    'triagem', coalesce(v.triagem, c.triagem),
    'busca', coalesce(v.busca, c.busca),
    'atualizado_em', v.atualizado_em,
    'padrao_triagem', c.triagem,
    'padrao_busca', c.busca);
end
$$;

create or replace function public.copiloto_salvar_criterios(p_anuncio uuid, p_criterios jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  ids text[] := '{}';
  v_versao text;
  c privado.copiloto_contas;
  obrigatorios integer;
begin
  perform privado.copiloto_minha_vaga(p_anuncio);
  if jsonb_typeof(p_criterios) <> 'array' or jsonb_array_length(p_criterios) > 8 then
    raise exception 'Ponha até 8 critérios.' using errcode = 'P0001';
  end if;
  for item in select * from jsonb_array_elements(p_criterios) loop
    if jsonb_typeof(item) <> 'object' or (item ->> 'id') !~ '^[a-z0-9]{1,12}$'
       or char_length(coalesce(item ->> 'texto', '')) not between 3 and 120
       or jsonb_typeof(item -> 'obrigatorio') <> 'boolean' then
      raise exception 'Confira os critérios.' using errcode = 'P0001';
    end if;
    if (item ->> 'id') = any (ids) then
      raise exception 'Confira os critérios.' using errcode = 'P0001';
    end if;
    if privado.copiloto_criterio_proibido(item ->> 'texto') then
      raise exception 'O critério “%” não pode: a lei não deixa escolher por isso.', item ->> 'texto'
        using errcode = 'P0001', hint = 'criterio_proibido';
    end if;
    ids := ids || (item ->> 'id');
  end loop;
  v_versao := md5(p_criterios::text);
  select * into c from privado.copiloto_contas x where x.conta_id = public.conta_atual();
  insert into privado.copiloto_vagas (anuncio_id, criterios, versao, triagem, busca, atualizado_em)
  values (p_anuncio, p_criterios, v_versao, c.triagem, c.busca, now())
  on conflict (anuncio_id) do update
    set criterios = excluded.criterios, versao = excluded.versao, atualizado_em = now();
  select count(*) into obrigatorios from jsonb_array_elements(p_criterios) e where (e ->> 'obrigatorio')::boolean;
  insert into privado.copiloto_registro (anuncio_id, conta_id, pessoa_id, acao, quantos, detalhe)
  values (p_anuncio, public.conta_atual(), (select auth.uid()), 'criterios', jsonb_array_length(p_criterios),
          obrigatorios::text);
  return v_versao;
end
$$;

create or replace function public.copiloto_ligar(p_anuncio uuid, p_triagem boolean, p_busca boolean, p_padrao boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.copiloto_minha_vaga(p_anuncio);
  insert into privado.copiloto_vagas (anuncio_id, triagem, busca)
  values (p_anuncio, p_triagem, p_busca)
  on conflict (anuncio_id) do update set triagem = excluded.triagem, busca = excluded.busca;
  if p_padrao then
    update privado.copiloto_contas set triagem = p_triagem, busca = p_busca where conta_id = public.conta_atual();
  end if;
  insert into privado.copiloto_registro (anuncio_id, conta_id, pessoa_id, acao, detalhe)
  values (p_anuncio, public.conta_atual(), (select auth.uid()), 'ligou',
          concat_ws(',', case when p_busca then 'busca' end, case when p_triagem then 'triagem' end,
                    case when p_padrao then 'padrao' end));
end
$$;

-- quantas leituras da IA dá para fazer agora (até 300 por conta em 24 horas)
create or replace function public.copiloto_reservar(p_anuncio uuid, p_origem text, p_quantos integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  usados integer;
  pode integer;
  ultimo privado.copiloto_registro;
begin
  perform privado.copiloto_minha_vaga(p_anuncio);
  if p_origem not in ('candidato', 'talento') or p_quantos not between 1 and 24 then
    raise exception 'Pedido inválido.' using errcode = 'P0001';
  end if;
  if not coalesce((select c.ia_melhorar_texto from public.config_site c limit 1), false) then
    raise exception 'A ajuda da IA está desligada agora.' using errcode = 'P0001', hint = 'ia_desligada';
  end if;
  perform pg_advisory_xact_lock(hashtext('publike:copiloto:' || conta::text));
  select count(*) into usados from privado.limites_uso l
   where l.perfil_id = conta and l.acao = 'copiloto' and l.criado_em > now() - interval '24 hours';
  pode := least(p_quantos, 300 - usados);
  if pode <= 0 then
    raise exception 'O copiloto já leu 300 currículos hoje nesta conta. Amanhã ele continua.'
      using errcode = 'P0001', hint = 'limite_copiloto';
  end if;
  insert into privado.limites_uso (perfil_id, acao) select conta, 'copiloto' from generate_series(1, pode);
  select * into ultimo from privado.copiloto_registro r where r.anuncio_id = p_anuncio
   order by r.criado_em desc, r.id desc limit 1;
  if found and ultimo.acao = 'avaliou' and ultimo.detalhe = p_origem and ultimo.criado_em > now() - interval '15 minutes' then
    update privado.copiloto_registro set quantos = quantos + pode, criado_em = now() where id = ultimo.id;
  else
    insert into privado.copiloto_registro (anuncio_id, conta_id, pessoa_id, acao, quantos, detalhe)
    values (p_anuncio, conta, (select auth.uid()), 'avaliou', pode, p_origem);
  end if;
  return pode;
end
$$;

create or replace function public.copiloto_guardar(
  p_anuncio uuid, p_perfil uuid, p_origem text, p_versao text, p_curriculo_em timestamptz, p_resultado jsonb,
  p_atende integer, p_obrigatorios_ok boolean, p_modelo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.copiloto_minha_vaga(p_anuncio);
  if p_origem = 'talento' then
    if not exists (select 1 from public.curriculo_visivel v where v.perfil_id = p_perfil) then
      raise exception 'Essa pessoa não está mais em Talentos.' using errcode = 'P0001';
    end if;
  elsif p_origem = 'candidato' then
    if not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p_perfil) then
      raise exception 'Candidato não encontrado.' using errcode = 'P0001';
    end if;
  else
    raise exception 'Pedido inválido.' using errcode = 'P0001';
  end if;
  insert into privado.copiloto_avaliacoes
    (anuncio_id, perfil_id, origem, versao, curriculo_em, resultado, atende, obrigatorios_ok, modelo, criado_em)
  values (p_anuncio, p_perfil, p_origem, p_versao, p_curriculo_em, p_resultado, p_atende, p_obrigatorios_ok,
          left(p_modelo, 60), now())
  on conflict (anuncio_id, perfil_id) do update
    set origem = excluded.origem, versao = excluded.versao, curriculo_em = excluded.curriculo_em,
        resultado = excluded.resultado, atende = excluded.atende, obrigatorios_ok = excluded.obrigatorios_ok,
        modelo = excluded.modelo, criado_em = now();
end
$$;

create or replace function public.copiloto_avaliacoes(p_anuncio uuid)
returns table (
  perfil_id uuid, origem text, versao text, curriculo_em timestamptz, resultado jsonb, atende integer,
  obrigatorios_ok boolean, criado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.copiloto_minha_vaga(p_anuncio);
  return query
    select a.perfil_id, a.origem, a.versao, a.curriculo_em, a.resultado, a.atende, a.obrigatorios_ok, a.criado_em
      from privado.copiloto_avaliacoes a where a.anuncio_id = p_anuncio;
end
$$;

create or replace function public.copiloto_convidar(p_anuncio uuid, p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.copiloto_minha_vaga(p_anuncio);
  perform pg_advisory_xact_lock(hashtext('publike:convites_semana:' || p_perfil::text));
  if (select count(*) from public.convites_vaga cv
       where cv.perfil_id = p_perfil and cv.criado_em > now() - interval '7 days') >= 3 then
    raise exception 'Essa pessoa já recebeu 3 convites nesta semana. Para não incomodar, espere alguns dias.'
      using errcode = 'P0001', hint = 'limite_convites_semana';
  end if;
  perform public.convidar_para_vaga(p_anuncio, p_perfil);
  insert into privado.copiloto_registro (anuncio_id, conta_id, pessoa_id, perfil_id, acao)
  values (p_anuncio, public.conta_atual(), (select auth.uid()), p_perfil, 'convidou');
end
$$;

create or replace function public.copiloto_registro(p_anuncio uuid, p_limite integer default 30)
returns table (acao text, quantos integer, detalhe text, quem text, convidado text, criado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.copiloto_minha_vaga(p_anuncio);
  return query
    select r.acao, r.quantos, r.detalhe,
           case when r.pessoa_id is distinct from r.conta_id then split_part(trim(q.nome), ' ', 1) end,
           case when r.perfil_id is not null then privado.nome_curto(p.nome) end,
           r.criado_em
      from privado.copiloto_registro r
      left join public.perfis q on q.id = r.pessoa_id
      left join public.perfis p on p.id = r.perfil_id
     where r.anuncio_id = p_anuncio
     order by r.criado_em desc, r.id desc
     limit least(greatest(p_limite, 1), 100);
end
$$;

revoke execute on function public.copiloto_liberado(), public.copiloto_da_vaga(uuid),
  public.copiloto_salvar_criterios(uuid, jsonb), public.copiloto_ligar(uuid, boolean, boolean, boolean),
  public.copiloto_reservar(uuid, text, integer),
  public.copiloto_guardar(uuid, uuid, text, text, timestamptz, jsonb, integer, boolean, text),
  public.copiloto_avaliacoes(uuid), public.copiloto_convidar(uuid, uuid), public.copiloto_registro(uuid, integer)
  from public, anon;
grant execute on function public.copiloto_liberado(), public.copiloto_da_vaga(uuid),
  public.copiloto_salvar_criterios(uuid, jsonb), public.copiloto_ligar(uuid, boolean, boolean, boolean),
  public.copiloto_reservar(uuid, text, integer),
  public.copiloto_guardar(uuid, uuid, text, text, timestamptz, jsonb, integer, boolean, text),
  public.copiloto_avaliacoes(uuid), public.copiloto_convidar(uuid, uuid), public.copiloto_registro(uuid, integer)
  to authenticated;
revoke execute on function privado.copiloto_liberado(uuid), privado.copiloto_criterio_proibido(text),
  privado.copiloto_minha_vaga(uuid) from public, anon, authenticated;


-- 4. Admin ----------------------------------------------------------------------------------------

create or replace function public.admin_copiloto_contas()
returns table (
  conta_id uuid, nome text, tipo text, liberado_em timestamptz, vagas integer, leituras_30d integer,
  convites_30d integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.conta_id, p.nome, p.tipo, c.liberado_em,
         (select count(*)::int from privado.copiloto_vagas v join public.anuncios a on a.id = v.anuncio_id
           where a.autor_id = c.conta_id),
         (select coalesce(sum(r.quantos), 0)::int from privado.copiloto_registro r
           where r.conta_id = c.conta_id and r.acao = 'avaliou' and r.criado_em > now() - interval '30 days'),
         (select count(*)::int from privado.copiloto_registro r
           where r.conta_id = c.conta_id and r.acao = 'convidou' and r.criado_em > now() - interval '30 days')
    from privado.copiloto_contas c
    join public.perfis p on p.id = c.conta_id
   order by c.liberado_em desc
$$;

create or replace function public.admin_liberar_copiloto(p_conta uuid, p_liberar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_liberar then
    if not exists (select 1 from public.perfis p where p.id = p_conta) then
      raise exception 'Conta não encontrada.' using errcode = 'P0001';
    end if;
    insert into privado.copiloto_contas (conta_id) values (p_conta) on conflict (conta_id) do nothing;
  else
    delete from privado.copiloto_contas where conta_id = p_conta;
  end if;
end
$$;

revoke execute on function public.admin_copiloto_contas(), public.admin_liberar_copiloto(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_copiloto_contas(), public.admin_liberar_copiloto(uuid, boolean)
  to service_role;
