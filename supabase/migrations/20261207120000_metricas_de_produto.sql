-- Métricas de produto do Painel (Admin › Painel e /equipe), as mais usadas em produto digital:
--   * ativos: contas ativas no dia (DAU), na semana (WAU) e no mês (MAU), e a aderência (DAU ÷ MAU);
--   * crescimento e a estrela-guia (matches) por semana, nas últimas 8 semanas;
--   * ativação: a conta nova que fez a primeira ação de valor em 7 dias, e em quanto tempo;
--   * retenção: por semana de cadastro (coortes) e quem voltou em 1, 7 e 30 dias;
--   * churn: quem usava no mês anterior e não voltou neste;
--   * os funis de quem procura e de quem contrata (contas criadas nos últimos 30 dias);
--   * a liquidez das vagas: candidato em 7 dias, o tempo até o primeiro, a resposta e as preenchidas.
-- Só números, nada com nome. Os dias são os de Goiânia.
--
-- "Ativa num dia" é a conta que entrou no site (privado.contas_ativas, desde 20261130120000) ou fez
-- alguma coisa: curtiu, respondeu uma curtida, publicou, mandou mensagem, salvou o currículo, pediu
-- conexão, ou criou a conta. Antes de existir o registro de quem entrou, só as ações contam.

create or replace function public.admin_metricas_produto()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v jsonb;
begin
  perform privado.exigir_admin();

  with
  contas as (
    select u.id, u.created_at as criada_em, (u.created_at at time zone 'America/Sao_Paulo')::date as criada, p.tipo
      from auth.users u
      left join public.perfis p on p.id = u.id
  ),
  -- um dia de uso por conta (os últimos 120 dias)
  uso as (
    select distinct q.conta_id, q.dia
      from (
        select a.conta_id, a.dia from privado.contas_ativas a where a.dia > hoje - 120
        union all
        select cu.perfil_id, (cu.criado_em at time zone 'America/Sao_Paulo')::date
          from public.curtidas cu where cu.criado_em > now() - interval '120 days'
        union all
        select an.autor_id, (cu.respondida_em at time zone 'America/Sao_Paulo')::date
          from public.curtidas cu join public.anuncios an on an.id = cu.anuncio_id
         where cu.respondida_em > now() - interval '120 days'
        union all
        select an.autor_id, (an.criado_em at time zone 'America/Sao_Paulo')::date
          from public.anuncios an where an.criado_em > now() - interval '120 days'
        union all
        select m.autor_id, (m.criado_em at time zone 'America/Sao_Paulo')::date
          from public.mensagens m where m.criado_em > now() - interval '120 days'
        union all
        select cv.perfil_id, (cv.atualizado_em at time zone 'America/Sao_Paulo')::date
          from public.curriculos cv where cv.atualizado_em > now() - interval '120 days'
        union all
        select x.pedida_por, (x.criado_em at time zone 'America/Sao_Paulo')::date
          from public.conexoes x where x.criado_em > now() - interval '120 days'
        union all
        select c.id, c.criada from contas c where c.criada > hoje - 120
      ) q
      join contas c on c.id = q.conta_id
     where q.dia > hoje - 120 and q.dia <= hoje
  ),
  -- 8 blocos de 7 dias, o 0 termina hoje
  semanas as (
    select k, hoje - 7 * k - 6 as inicio, hoje - 7 * k as fim from generate_series(0, 7) k
  ),
  -- a primeira ação de valor de cada conta criada entre 37 e 8 dias atrás (a semana dela já terminou):
  -- quem procura, o currículo ou a primeira curtida; quem contrata ou presta serviço, o primeiro anúncio
  coorte_ativacao as (
    select c.id, c.criada_em, c.tipo,
           least(
             case when c.tipo = 'pessoa' then (select min(cv.criado_em) from public.curriculos cv where cv.perfil_id = c.id) end,
             case when c.tipo = 'pessoa' then (select min(cu.criado_em) from public.curtidas cu where cu.perfil_id = c.id) end,
             (select min(an.criado_em) from public.anuncios an where an.autor_id = c.id)
           ) as primeira
      from contas c
     where c.criada between hoje - 37 and hoje - 8
  ),
  -- quem criou a conta nos últimos 30 dias, para os funis
  novas as (
    select c.id, c.tipo,
           exists (select 1 from public.curriculos cv where cv.perfil_id = c.id) as curriculo,
           exists (select 1 from public.curtidas cu join public.anuncios an on an.id = cu.anuncio_id
                    where cu.perfil_id = c.id and an.tipo = 'vaga') as curtiu,
           exists (select 1 from public.curtidas cu join public.anuncios an on an.id = cu.anuncio_id
                    where cu.perfil_id = c.id and an.tipo = 'vaga' and cu.status = 'match') as match_pessoa,
           exists (select 1 from public.anuncios an where an.autor_id = c.id and an.tipo = 'vaga') as vaga,
           exists (select 1 from public.curtidas cu join public.anuncios an on an.id = cu.anuncio_id
                    where an.autor_id = c.id and an.tipo = 'vaga') as candidato,
           exists (select 1 from public.curtidas cu join public.anuncios an on an.id = cu.anuncio_id
                    where an.autor_id = c.id and an.tipo = 'vaga' and cu.status = 'match') as aceitou
      from contas c
     where c.criada > hoje - 30
  ),
  -- as vagas publicadas entre 37 e 8 dias atrás (os 7 dias delas já passaram)
  vagas_coorte as (
    select an.id, an.criado_em,
           (select min(cu.criado_em) from public.curtidas cu where cu.anuncio_id = an.id) as primeira,
           (select count(*) from public.curtidas cu where cu.anuncio_id = an.id) as candidatos
      from public.anuncios an
     where an.tipo = 'vaga' and an.status <> 'removido'
       and (an.criado_em at time zone 'America/Sao_Paulo')::date between hoje - 37 and hoje - 8
  ),
  -- as curtidas em vagas feitas entre 37 e 8 dias atrás (a resposta teve 7 dias)
  curtidas_coorte as (
    select cu.criado_em, cu.respondida_em, cu.status
      from public.curtidas cu join public.anuncios an on an.id = cu.anuncio_id and an.tipo = 'vaga'
     where (cu.criado_em at time zone 'America/Sao_Paulo')::date between hoje - 37 and hoje - 8
  ),
  por_dia as (select u.dia, count(*)::numeric as n from uso u group by u.dia)
  select jsonb_build_object(
    'hoje', hoje,
    -- desde quando "entrou no site" conta (antes, só as ações)
    'desde', (select min(a.dia) from privado.contas_ativas a),
    'ativos', jsonb_build_object(
      'dau_hoje', (select count(*) from uso u where u.dia = hoje),
      -- a média dos 7 dias inteiros antes de hoje (dia sem ninguém conta zero)
      'dau_media', (select round(avg(coalesce(d.n, 0)), 1)
                      from generate_series(hoje - 7, hoje - 1, interval '1 day') g(dia)
                      left join por_dia d on d.dia = g.dia::date),
      'wau', (select count(distinct u.conta_id) from uso u where u.dia > hoje - 7),
      'mau', (select count(distinct u.conta_id) from uso u where u.dia > hoje - 30),
      'mau_antes', (select count(distinct u.conta_id) from uso u where u.dia between hoje - 59 and hoje - 30),
      'mau_pessoas', (select count(distinct u.conta_id) from uso u join contas c on c.id = u.conta_id
                       where u.dia > hoje - 30 and c.tipo = 'pessoa'),
      'mau_empresas', (select count(distinct u.conta_id) from uso u join contas c on c.id = u.conta_id
                        where u.dia > hoje - 30 and c.tipo in ('empresa', 'comercio', 'agencia')),
      -- quantos dias, em média, cada conta ativa usou o Publike no mês
      'dias_por_conta', (select round(avg(x.n), 1) from (
                           select u.conta_id, count(*) as n from uso u where u.dia > hoje - 30 group by u.conta_id) x)
    ),
    'semanas', (select coalesce(jsonb_agg(jsonb_build_object(
        'inicio', s.inicio,
        'fim', s.fim,
        'contas', (select count(*) from contas c where c.criada between s.inicio and s.fim),
        'matches', (select count(*) from public.curtidas cu
                     where cu.status = 'match'
                       and (coalesce(cu.respondida_em, cu.criado_em) at time zone 'America/Sao_Paulo')::date
                           between s.inicio and s.fim),
        'ativos', (select count(distinct u.conta_id) from uso u where u.dia between s.inicio and s.fim),
        'curtidas', (select count(*) from public.curtidas cu
                      where (cu.criado_em at time zone 'America/Sao_Paulo')::date between s.inicio and s.fim),
        'vagas', (select count(*) from public.anuncios an
                   where an.tipo = 'vaga' and (an.criado_em at time zone 'America/Sao_Paulo')::date
                         between s.inicio and s.fim)
      ) order by s.k desc), '[]'::jsonb) from semanas s),
    'ativacao', (select jsonb_build_object(
        'contas', count(*),
        'com_perfil', count(*) filter (where a.tipo is not null),
        'ativadas', count(*) filter (where a.primeira <= a.criada_em + interval '7 days'),
        'pessoas', count(*) filter (where a.tipo = 'pessoa'),
        'pessoas_ativadas', count(*) filter (where a.tipo = 'pessoa' and a.primeira <= a.criada_em + interval '7 days'),
        'empresas', count(*) filter (where a.tipo in ('empresa', 'comercio', 'agencia')),
        'empresas_ativadas', count(*) filter (where a.tipo in ('empresa', 'comercio', 'agencia')
                                                and a.primeira <= a.criada_em + interval '7 days'),
        'mediana_horas', round((percentile_cont(0.5) within group (
                           order by greatest(0, extract(epoch from a.primeira - a.criada_em) / 3600))
                           filter (where a.primeira <= a.criada_em + interval '7 days'))::numeric, 1)
      ) from coorte_ativacao a),
    -- por semana de cadastro: o tamanho e quantos usaram na 1ª, 2ª, 3ª e 4ª semana depois
    -- (null: a semana ainda não terminou para todos dessa turma)
    'retencao', (select coalesce(jsonb_agg(jsonb_build_object(
        'inicio', s.inicio,
        'fim', s.fim,
        'tamanho', (select count(*) from contas c where c.criada between s.inicio and s.fim),
        'semanas', (select jsonb_agg(
            case when s.fim + 7 * w + 6 <= hoje - 1 then (
              select count(*) from contas c
               where c.criada between s.inicio and s.fim
                 and exists (select 1 from uso u where u.conta_id = c.id
                              and u.dia between c.criada + 7 * w and c.criada + 7 * w + 6))
            end order by w) from generate_series(1, 4) w)
      ) order by s.k desc), '[]'::jsonb) from semanas s),
    -- voltou em até 1, 7 e 30 dias (as contas dos últimos 90 dias que já tiveram esse tempo)
    'voltaram', (select jsonb_object_agg(n::text, jsonb_build_object(
        'base', (select count(*) from contas c where c.criada between hoje - 90 and hoje - n - 1),
        'voltaram', (select count(*) from contas c
                      where c.criada between hoje - 90 and hoje - n - 1
                        and exists (select 1 from uso u where u.conta_id = c.id
                                     and u.dia between c.criada + 1 and c.criada + n))
      )) from unnest(array[1, 7, 30]) n),
    'churn', jsonb_build_object(
      'base', (select count(distinct u.conta_id) from uso u where u.dia between hoje - 59 and hoje - 30),
      'sairam', (select count(*) from (select distinct u.conta_id from uso u where u.dia between hoje - 59 and hoje - 30) a
                  where not exists (select 1 from uso u2 where u2.conta_id = a.conta_id and u2.dia > hoje - 30))
    ),
    'funil', (select jsonb_build_object(
        'contas', count(*),
        'com_perfil', count(*) filter (where n.tipo is not null),
        'pessoas', count(*) filter (where n.tipo = 'pessoa'),
        'curriculo', count(*) filter (where n.tipo = 'pessoa' and n.curriculo),
        'curtiu', count(*) filter (where n.tipo = 'pessoa' and n.curtiu),
        'match', count(*) filter (where n.tipo = 'pessoa' and n.match_pessoa),
        'empresas', count(*) filter (where n.tipo in ('empresa', 'comercio', 'agencia')),
        'vaga', count(*) filter (where n.tipo in ('empresa', 'comercio', 'agencia') and n.vaga),
        'candidato', count(*) filter (where n.tipo in ('empresa', 'comercio', 'agencia') and n.candidato),
        'aceitou', count(*) filter (where n.tipo in ('empresa', 'comercio', 'agencia') and n.aceitou),
        -- visitas de quem não entrou na conta (uma por pessoa por dia), nos 30 dias
        'visitas', (select count(*) from privado.acessos_site s where s.dia > hoje - 30 and not s.com_conta)
      ) from novas n),
    'liquidez', jsonb_build_object(
      'vagas', (select count(*) from vagas_coorte),
      'com_candidato_7d', (select count(*) from vagas_coorte x where x.primeira <= x.criado_em + interval '7 days'),
      'mediana_horas_primeiro', (select round((percentile_cont(0.5) within group (
                                    order by extract(epoch from x.primeira - x.criado_em) / 3600))::numeric, 1)
                                   from vagas_coorte x where x.primeira is not null),
      'candidatos_media', (select round(avg(x.candidatos), 1) from vagas_coorte x),
      'curtidas', (select count(*) from curtidas_coorte),
      'respondidas_7d', (select count(*) from curtidas_coorte y where y.respondida_em <= y.criado_em + interval '7 days'),
      'mediana_horas_resposta', (select round((percentile_cont(0.5) within group (
                                    order by extract(epoch from y.respondida_em - y.criado_em) / 3600))::numeric, 1)
                                   from curtidas_coorte y where y.respondida_em is not null),
      'matches', (select count(*) from curtidas_coorte y where y.status = 'match'),
      'preenchidas_publike', (select count(*) from privado.encerramentos e
                               where e.tipo = 'vaga' and e.motivo = 'contratei_publike' and e.criado_em > now() - interval '30 days'),
      'encerradas_com_motivo', (select count(*) from privado.encerramentos e
                                 where e.tipo = 'vaga' and e.criado_em > now() - interval '30 days'),
      'vagas_no_ar', (select count(*) from public.anuncios an
                       where an.tipo = 'vaga' and an.status = 'ativo' and an.expira_em > now())
    ),
    'engajamento', jsonb_build_object(
      'acoes_7d', (select (select count(*) from public.curtidas cu where cu.criado_em > now() - interval '7 days')
                        + (select count(*) from public.mensagens m where m.criado_em > now() - interval '7 days')
                        + (select count(*) from public.anuncios an where an.criado_em > now() - interval '7 days')
                        + (select count(*) from public.conexoes x where x.criado_em > now() - interval '7 days')),
      'mensagens_7d', (select count(*) from public.mensagens m where m.criado_em > now() - interval '7 days')
    )
  ) into v;
  return v;
end
$$;
revoke execute on function public.admin_metricas_produto() from public, anon, authenticated;
grant execute on function public.admin_metricas_produto() to service_role;

-- o /equipe (a de 20261130120000, mais as métricas)
create or replace function public.painel_no_site()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
  hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if not privado.pode_ver_painel_no_site() then
    raise exception 'Só a equipe do Publike vê o painel.' using errcode = '42501';
  end if;
  perform set_config('publike.painel_no_site', 'sim', true);
  v := jsonb_build_object(
    'resumo', public.admin_resumo(),
    'acessos', public.admin_acessos_site(),
    'presenca', public.admin_presenca(),
    'metricas', public.admin_metricas_produto(),
    'encerramentos', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.admin_motivos_encerramento(30) e),
    'matches_hoje', (select count(*) from public.curtidas c where c.status = 'match' and c.respondida_em >= hoje)
  );
  perform set_config('publike.painel_no_site', '', true);
  return v;
exception when others then
  perform set_config('publike.painel_no_site', '', true);
  raise;
end
$$;
revoke execute on function public.painel_no_site() from public, anon;
grant execute on function public.painel_no_site() to authenticated;

notify pgrst, 'reload schema';
