-- Convidar vários de uma vez (08/11/2026; claude/plano-pedido-do-cliente-convites-e-testes.md, parte 1).
-- Pode rodar de novo.
--
-- 1. O convite guarda o recado (opcional, até 300 caracteres, sem contato).
-- 2. O limite do dia: 40, ou 100 para empresa, comércio ou agência conferida.
-- 3. Para não virar spam: a mesma conta não convida a mesma pessoa mais de 3 vezes em 30 dias se ela não
--    curtiu nenhuma vaga da conta nesse tempo.
-- 4. convidar_para_vaga (um) e convidar_varios (até 48) usam as mesmas regras, pela conta atual (a equipe
--    da agência convida pela agência).
-- 5. convites_da_vaga: quantos convites a vaga mandou e quantos curtiram.
-- 6. Chamar de novo: o WhatsApp de quem já deu match (só quando as duas vagas não são "só pelo chat").

-- 1. O recado ----------------------------------------------------------------------------

alter table public.convites_vaga add column if not exists recado text;
alter table public.convites_vaga drop constraint if exists convites_vaga_recado;
alter table public.convites_vaga add constraint convites_vaga_recado check (char_length(recado) <= 300);

-- 2. O limite do dia ----------------------------------------------------------------------

create or replace function privado.limite_de_convites(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (select 1 from public.perfis p where p.id = p_conta and p.tipo <> 'pessoa' and p.verificado)
              then 100 else 40 end
$$;
revoke all on function privado.limite_de_convites(uuid) from public;

-- 3. Por que essa pessoa não pode receber o convite (null: pode) ----------------------------

create or replace function privado.motivo_sem_convite(p_conta uuid, p_anuncio uuid, p_cidade text, p_perfil uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (
      select 1 from public.curriculo_visivel v join public.perfis p on p.id = v.perfil_id
       where v.perfil_id = p_perfil and p.tipo = 'pessoa'
         and (lower(p.cidade) = lower(p_cidade)
              or exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = p_perfil))
         and (p.suspenso_ate is null or p.suspenso_ate < now())
    ) or privado.ha_bloqueio(p_conta, p_perfil) then 'fora'
    when exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p_perfil) then 'curtiu'
    when exists (select 1 from public.convites_vaga cv where cv.anuncio_id = p_anuncio and cv.perfil_id = p_perfil) then 'convidado'
    when (select count(*) from public.convites_vaga cv join public.anuncios a on a.id = cv.anuncio_id
           where a.autor_id = p_conta and cv.perfil_id = p_perfil and cv.criado_em > now() - interval '30 days') >= 3
     and not exists (select 1 from public.curtidas k join public.anuncios a on a.id = k.anuncio_id
                      where a.autor_id = p_conta and k.perfil_id = p_perfil and k.criado_em > now() - interval '30 days')
      then 'muitos'
    else null
  end
$$;
revoke all on function privado.motivo_sem_convite(uuid, uuid, text, uuid) from public;

-- O convite em si: grava, conta no limite e avisa (o sino; o celular e o e-mail saem das filas).
create or replace function privado.gravar_convite(p_conta uuid, p_anuncio uuid, p_titulo text, p_perfil uuid, p_recado text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  quem text;
begin
  insert into public.convites_vaga (anuncio_id, perfil_id, recado) values (p_anuncio, p_perfil, p_recado);
  insert into privado.limites_uso (perfil_id, acao) values ((select auth.uid()), 'convite');
  select p.nome into quem from public.perfis p where p.id = p_conta;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'convite', p_anuncio, p_conta,
          left(case when p_recado is null
                    then coalesce(quem, 'Uma empresa') || ' viu seu currículo e convidou você para a vaga “' || p_titulo
                         || '”. Veja os detalhes e, se tiver interesse, curta a vaga.'
                    else coalesce(quem, 'Uma empresa') || ' convidou você para a vaga “' || p_titulo || '”: “'
                         || p_recado || '”'
               end, 300));
end
$$;
revoke all on function privado.gravar_convite(uuid, uuid, text, uuid, text) from public;

-- A vaga da conta atual que pode receber convites (no ar e não preenchida), ou o erro.
create or replace function privado.vaga_para_convite(p_anuncio uuid, out titulo text, out cidade text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_preenchida timestamptz;
begin
  select a.titulo, a.cidade, a.preenchida_em into titulo, cidade, v_preenchida
    from public.anuncios a
   where a.id = p_anuncio and a.autor_id = (select public.conta_atual()) and a.tipo = 'vaga'
     and a.status = 'ativo' and a.expira_em > now();
  if not found then
    raise exception 'Só dá para convidar para uma vaga sua que esteja no ar.' using errcode = 'P0001';
  end if;
  if v_preenchida is not null then
    raise exception 'Esta vaga já foi preenchida: não dá para convidar.' using errcode = 'P0001';
  end if;
end
$$;
revoke all on function privado.vaga_para_convite(uuid) from public;

-- Quantos convites a pessoa logada ainda pode mandar hoje.
create or replace function privado.convites_que_faltam(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(privado.limite_de_convites(p_conta) - (
    select count(*)::integer from privado.limites_uso l
     where l.perfil_id = (select auth.uid()) and l.acao = 'convite' and l.criado_em > now() - interval '24 hours'), 0)
$$;
revoke all on function privado.convites_que_faltam(uuid) from public;

-- 4. Convidar um (o de sempre, com as regras novas) e vários ---------------------------------

create or replace function public.convidar_para_vaga(p_anuncio uuid, p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v record;
  motivo text;
begin
  perform privado.exigir_conta_ativa();
  select * into v from privado.vaga_para_convite(p_anuncio);
  motivo := privado.motivo_sem_convite(conta, p_anuncio, v.cidade, p_perfil);
  if motivo = 'fora' then
    raise exception 'Essa pessoa não está mais em Talentos.' using errcode = 'P0001';
  elsif motivo = 'curtiu' then
    raise exception 'Essa pessoa já curtiu a vaga: ela está na sua caixa de entrada.' using errcode = 'P0001';
  elsif motivo = 'convidado' then
    raise exception 'Você já convidou essa pessoa para esta vaga.' using errcode = 'P0001';
  elsif motivo = 'muitos' then
    raise exception 'Você já mandou 3 convites para essa pessoa em 30 dias, sem resposta. Espere ela curtir uma vaga sua.'
      using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('publike:convite:' || (select auth.uid())::text));
  if privado.convites_que_faltam(conta) <= 0 then
    raise exception 'Você já mandou % convites hoje. Tente de novo amanhã.', privado.limite_de_convites(conta)
      using errcode = 'P0001', hint = 'limite_convite';
  end if;
  perform privado.gravar_convite(conta, p_anuncio, v.titulo, p_perfil, null);
end
$$;
revoke execute on function public.convidar_para_vaga(uuid, uuid) from public, anon;
grant execute on function public.convidar_para_vaga(uuid, uuid) to authenticated;

-- Até 48 pessoas (duas páginas de Talentos). Devolve {enviados, fora: [{perfil_id, motivo}], faltam}.
-- motivo: fora (saiu de Talentos), curtiu, convidado, muitos (3 em 30 dias sem resposta), limite (o do dia).
create or replace function public.convidar_varios(p_anuncio uuid, p_perfis uuid[], p_recado text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v record;
  recado text := nullif(btrim(regexp_replace(coalesce(p_recado, ''), '\s+', ' ', 'g')), '');
  pessoa uuid;
  motivo text;
  faltam integer;
  enviados integer := 0;
  fora jsonb := '[]'::jsonb;
begin
  perform privado.exigir_conta_ativa();
  if coalesce(cardinality(p_perfis), 0) = 0 then
    raise exception 'Marque quem você quer convidar.' using errcode = 'P0001';
  end if;
  if cardinality(p_perfis) > 48 then
    raise exception 'Dá para convidar até 48 pessoas de uma vez.' using errcode = 'P0001';
  end if;
  if char_length(recado) > 300 then
    raise exception 'O recado pode ter até 300 caracteres.' using errcode = 'P0001';
  end if;
  if recado is not null and public.tem_contato(recado) then
    raise exception 'Tire o telefone, o e-mail ou o link do recado: o contato aparece no match.' using errcode = 'P0001';
  end if;
  select * into v from privado.vaga_para_convite(p_anuncio);
  perform pg_advisory_xact_lock(hashtext('publike:convite:' || (select auth.uid())::text));
  faltam := privado.convites_que_faltam(conta);
  for pessoa in select distinct x from unnest(p_perfis) x where x is not null loop
    motivo := privado.motivo_sem_convite(conta, p_anuncio, v.cidade, pessoa);
    if motivo is null and faltam <= 0 then
      motivo := 'limite';
    end if;
    if motivo is null then
      perform privado.gravar_convite(conta, p_anuncio, v.titulo, pessoa, recado);
      enviados := enviados + 1;
      faltam := faltam - 1;
    else
      fora := fora || jsonb_build_object('perfil_id', pessoa, 'motivo', motivo);
    end if;
  end loop;
  return jsonb_build_object('enviados', enviados, 'fora', fora, 'faltam', faltam);
end
$$;
revoke execute on function public.convidar_varios(uuid, uuid[], text) from public, anon;
grant execute on function public.convidar_varios(uuid, uuid[], text) to authenticated;

-- 5. Os convites de uma vaga da conta: quantos foram e quantos curtiram depois -----------------

create or replace function public.convites_da_vaga(p_anuncio uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enviados', count(*),
    'curtiram', count(*) filter (where exists (
      select 1 from public.curtidas k where k.anuncio_id = cv.anuncio_id and k.perfil_id = cv.perfil_id)),
    'faltam_hoje', privado.convites_que_faltam((select public.conta_atual())))
    from public.convites_vaga cv
    join public.anuncios a on a.id = cv.anuncio_id
   where cv.anuncio_id = p_anuncio and a.autor_id = (select public.conta_atual())
$$;
revoke execute on function public.convites_da_vaga(uuid) from public, anon;
grant execute on function public.convites_da_vaga(uuid) to authenticated;

-- 6. Chamar de novo, com o WhatsApp de quem já deu match ----------------------------------------
-- (a função de 20270103120000_chamar_de_novo.sql; mudou o que devolve: apaga e cria de novo)

drop function if exists public.candidatos_de_antes(uuid);
create function public.candidatos_de_antes(p_anuncio uuid)
returns table (perfil_id uuid, nome text, foto text, cidade text, bairro text, vaga text, ate_onde text,
               candidatou_em timestamptz, convidado boolean, whatsapp text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  so_chat boolean;
begin
  select a.contato_por = 'chat' into so_chat
    from public.anuncios a where a.id = p_anuncio and a.autor_id = eu and a.tipo = 'vaga';
  if not found then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  return query
  with antes as (
    select c.perfil_id, a.titulo, c.criado_em as curtido_em, a.contato_por,
           case when exists (select 1 from public.finalistas f where f.anuncio_id = c.anuncio_id and f.perfil_id = c.perfil_id) then 'finalista'
                when e.etapa = 'entrevista' or exists (select 1 from public.entrevistas x where x.anuncio_id = c.anuncio_id and x.perfil_id = c.perfil_id) then 'entrevista'
                else 'match' end as ate_onde
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where a.autor_id = eu and a.tipo = 'vaga' and a.id <> p_anuncio
       and c.status = 'match'
       and c.criado_em > now() - interval '6 months'
       and coalesce(e.etapa, 'novo') <> 'contratado'
  ),
  melhor as (
    select distinct on (x.perfil_id) x.*
      from antes x
     order by x.perfil_id,
              case x.ate_onde when 'finalista' then 0 when 'entrevista' then 1 else 2 end,
              x.curtido_em desc
  )
  select m.perfil_id, p.nome, p.foto, p.cidade, p.bairro, m.titulo, m.ate_onde, m.curtido_em,
         exists (select 1 from public.convites_vaga cv where cv.anuncio_id = p_anuncio and cv.perfil_id = m.perfil_id),
         case when not so_chat and m.contato_por <> 'chat' then ct.whatsapp end
    from melhor m
    join public.perfis p on p.id = m.perfil_id
    join public.curriculo_visivel v on v.perfil_id = m.perfil_id
    left join public.contatos ct on ct.perfil_id = m.perfil_id
   where p.tipo = 'pessoa'
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and not privado.ha_bloqueio(eu, m.perfil_id)
     and not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = m.perfil_id)
   order by case m.ate_onde when 'finalista' then 0 when 'entrevista' then 1 else 2 end, m.curtido_em desc
   limit 50;
end
$$;
revoke all on function public.candidatos_de_antes(uuid) from public, anon;
grant execute on function public.candidatos_de_antes(uuid) to authenticated;

notify pgrst, 'reload schema';
