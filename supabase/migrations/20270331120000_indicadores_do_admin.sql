-- Painel do admin: os números certos e o período (claude/plano-indicadores-do-admin.md, parte 2). Pode rodar de novo.
-- Rode depois de 20270330120000_numeros_para_moderador.sql.
--
-- 1) privado.contas_fora_dos_numeros(): a equipe (moderadores e quem vê o painel no site, a mesma regra de
--    20261217120000) e as contas de teste dos pagamentos. "Sem a equipe" tira essas contas.
-- 2) privado.indicadores_entre(ini, fim): os números de um intervalo, todos somáveis dia a dia (para o histórico da
--    parte 3): visitantes, contas novas, ativadas, candidaturas, respostas e matches (gente × automático),
--    encontros, entrevistas, contratações, vagas novas (as da equipe à parte), 3+ candidatos em 48 h e as empresas
--    que publicaram de novo em 30 dias.
-- 3) public.admin_indicadores(dias, com_equipe): os últimos `dias` dias inteiros (até ontem), os `dias` antes, hoje
--    até agora e as pessoas ativas (contas diferentes, que não se somam).
-- 4) public.admin_oferta_procura(dias): oferta e procura por área, por cidade e por bairro de Goiânia.
-- 5) public.admin_numeros_do_menu(): só os 2 números do menu (o menu deixa de ler o admin_resumo inteiro).
-- 6) public.painel_no_site_indicadores(dias): os mesmos números para Equipe › Números (a porta do painel_no_site).
-- Só totais: nada com nome, e-mail ou telefone.

create or replace function privado.contas_fora_dos_numeros()
returns table (conta_id uuid)
language sql
stable
set search_path = ''
as $$
  select m.perfil_id from public.moderadores m
  union
  select p.usuario_id from privado.painel_no_site p
  union
  select t.conta_id from privado.pagamentos_teste t
$$;
revoke execute on function privado.contas_fora_dos_numeros() from public, anon, authenticated;

-- Os números de [p_ini, p_fim). Encontro: o match em que houve contato de verdade (um toque em WhatsApp, telefone ou
-- e-mail, de qualquer lado, ou mensagens de gente dos dois lados no chat), contado no momento do primeiro contato.
-- Contratação: a pessoa que foi para a etapa Contratado, mais a vaga encerrada com "Contratei alguém pelo Publike"
-- sem ninguém marcado como contratado (conta 1).
create or replace function privado.indicadores_entre(p_ini timestamptz, p_fim timestamptz, p_com_equipe boolean default false)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  d_ini date := (p_ini at time zone 'America/Sao_Paulo')::date;
  d_fim date := (p_fim at time zone 'America/Sao_Paulo')::date;
  v jsonb;
begin
  with
  fora as (select f.conta_id from privado.contas_fora_dos_numeros() f where not p_com_equipe),
  vagas as (
    select a.id, a.autor_id, a.criado_em,
           not exists (select 1 from auth.users u where u.id = a.autor_id and u.last_sign_in_at is not null) as da_equipe,
           (select count(*) from public.curtidas c
             where c.anuncio_id = a.id and c.criado_em <= a.criado_em + interval '48 hours'
               and c.perfil_id not in (select conta_id from fora)) as em_48h
      from public.anuncios a
     where a.tipo = 'vaga' and a.status <> 'removido' and a.criado_em >= p_ini and a.criado_em < p_fim
       and a.autor_id not in (select conta_id from fora)
  ),
  curtidas as (
    select cu.*, an.autor_id
      from public.curtidas cu
      join public.anuncios an on an.id = cu.anuncio_id and an.tipo = 'vaga'
     where cu.perfil_id not in (select conta_id from fora) and an.autor_id not in (select conta_id from fora)
  ),
  encontros as (
    select x.em from (
      select least(
               (select min(h.em) from privado.historico_etapas h
                 where h.anuncio_id = cu.anuncio_id and h.perfil_id = cu.perfil_id
                   and (h.o_que like 'contato:%' or h.o_que like 'contato\_pessoa:%')),
               (select case when count(*) filter (where m.autor_id = cu.perfil_id) > 0
                             and count(*) filter (where m.autor_id <> cu.perfil_id) > 0
                            then greatest(min(m.criado_em) filter (where m.autor_id = cu.perfil_id),
                                          min(m.criado_em) filter (where m.autor_id <> cu.perfil_id)) end
                  from public.mensagens m
                 where m.anuncio_id = cu.anuncio_id and m.perfil_id = cu.perfil_id and not m.automatica)
             ) as em
        from curtidas cu
       where cu.status in ('match', 'desfeito') and cu.respondida_em < p_fim
         and cu.respondida_em >= p_ini - interval '90 days'
    ) x
     where x.em >= p_ini and x.em < p_fim
  ),
  contas as (
    select u.id, u.created_at, p.tipo
      from auth.users u
      left join public.perfis p on p.id = u.id
     where u.id not in (select conta_id from fora)
  ),
  -- a primeira ação de valor (quem procura: o currículo ou a primeira curtida; os outros: o primeiro anúncio)
  ativadas as (
    select c.id
      from contas c
     where c.created_at >= p_ini - interval '90 days' and c.created_at < p_fim
       and least(
             case when c.tipo = 'pessoa' then (select min(cv.criado_em) from public.curriculos cv where cv.perfil_id = c.id) end,
             case when c.tipo = 'pessoa' then (select min(cu.criado_em) from public.curtidas cu where cu.perfil_id = c.id) end,
             (select min(an.criado_em) from public.anuncios an where an.autor_id = c.id)
           ) between p_ini and p_fim - interval '1 microsecond'
  ),
  primeiras as (
    select a.autor_id, min(a.criado_em) as primeira
      from public.anuncios a
      join public.perfis p on p.id = a.autor_id and p.tipo in ('empresa', 'comercio', 'agencia')
     where a.tipo = 'vaga' and a.status <> 'removido' and a.autor_id not in (select conta_id from fora)
     group by a.autor_id
  ),
  de_novo as (
    select x.autor_id,
           exists (select 1 from public.anuncios a
                    where a.autor_id = x.autor_id and a.tipo = 'vaga' and a.status <> 'removido'
                      and a.criado_em > x.primeira + interval '1 day'
                      and a.criado_em <= x.primeira + interval '30 days') as voltou
      from primeiras x
     where x.primeira + interval '30 days' >= p_ini and x.primeira + interval '30 days' < p_fim
  ),
  contratados as (
    select distinct h.anuncio_id, h.perfil_id
      from privado.historico_etapas h
      join public.anuncios an on an.id = h.anuncio_id
     where h.o_que = 'etapa:contratado' and h.em >= p_ini and h.em < p_fim
       and an.autor_id not in (select conta_id from fora)
  ),
  encerradas as (
    select e.anuncio_id
      from privado.encerramentos e
     where e.motivo = 'contratei_publike' and e.criado_em >= p_ini and e.criado_em < p_fim
       and e.autor_id not in (select conta_id from fora)
       and not exists (select 1 from public.etapas_candidatos ec where ec.anuncio_id = e.anuncio_id and ec.etapa = 'contratado')
  )
  select jsonb_build_object(
    'visitantes', (select count(*) from privado.acessos_site s where s.dia >= d_ini and s.dia < d_fim),
    'contas_novas', (select count(*) from contas c where c.created_at >= p_ini and c.created_at < p_fim),
    'contas_novas_pessoas', (select count(*) from contas c
                              where c.created_at >= p_ini and c.created_at < p_fim and c.tipo = 'pessoa'),
    'contas_novas_empresas', (select count(*) from contas c
                               where c.created_at >= p_ini and c.created_at < p_fim
                                 and c.tipo in ('empresa', 'comercio', 'agencia')),
    'ativadas', (select count(*) from ativadas),
    'candidaturas', (select count(*) from curtidas cu where cu.criado_em >= p_ini and cu.criado_em < p_fim),
    'respondidas_gente', (select count(*) from curtidas cu
                           where cu.respondida_em >= p_ini and cu.respondida_em < p_fim
                             and cu.respondida_por in ('empresa', 'pessoa')),
    'respondidas_auto', (select count(*) from curtidas cu
                          where cu.respondida_em >= p_ini and cu.respondida_em < p_fim
                            and cu.respondida_por in ('direto', 'automacao', 'regra', 'publike')),
    'matches_gente', (select count(*) from curtidas cu
                       where cu.status in ('match', 'desfeito') and cu.respondida_em >= p_ini and cu.respondida_em < p_fim
                         and coalesce(cu.respondida_por, 'empresa') in ('empresa', 'pessoa')),
    'matches_auto', (select count(*) from curtidas cu
                      where cu.status in ('match', 'desfeito') and cu.respondida_em >= p_ini and cu.respondida_em < p_fim
                        and cu.respondida_por in ('direto', 'automacao', 'regra', 'publike')),
    'encontros', (select count(*) from encontros),
    'entrevistas', (select count(*) from public.entrevistas e
                     join public.anuncios an on an.id = e.anuncio_id
                    where e.criado_em >= p_ini and e.criado_em < p_fim and e.situacao <> 'cancelada'
                      and an.autor_id not in (select conta_id from fora)),
    'contratacoes', (select count(*) from contratados) + (select count(*) from encerradas),
    'vagas_novas', (select count(*) from vagas),
    'vagas_equipe', (select count(*) from vagas where da_equipe),
    'vagas_48h', (select count(*) from vagas where criado_em <= now() - interval '48 hours'),
    'vagas_48h_3', (select count(*) from vagas where criado_em <= now() - interval '48 hours' and em_48h >= 3),
    'de_novo_base', (select count(*) from de_novo),
    'de_novo', (select count(*) from de_novo where voltou)
  ) into v;
  return v;
end
$$;
revoke execute on function privado.indicadores_entre(timestamptz, timestamptz, boolean) from public, anon, authenticated;

-- As contas ativas (diferentes) num intervalo de dias: entrou no site ou fez alguma coisa (o mesmo "uso" de
-- admin_metricas_produto), separadas entre quem procura e quem contrata.
create or replace function privado.ativos_entre(p_de date, p_ate date, p_com_equipe boolean default false)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with fora as (select f.conta_id from privado.contas_fora_dos_numeros() f where not p_com_equipe),
  ini as (select (p_de::timestamp at time zone 'America/Sao_Paulo') as t),
  fim as (select ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo') as t),
  uso as (
    select a.conta_id from privado.contas_ativas a where a.dia between p_de and p_ate
    union
    select cu.perfil_id from public.curtidas cu where cu.criado_em >= (select t from ini) and cu.criado_em < (select t from fim)
    union
    select an.autor_id from public.curtidas cu join public.anuncios an on an.id = cu.anuncio_id
     where cu.respondida_em >= (select t from ini) and cu.respondida_em < (select t from fim)
    union
    select an.autor_id from public.anuncios an where an.criado_em >= (select t from ini) and an.criado_em < (select t from fim)
    union
    select m.autor_id from public.mensagens m
     where m.criado_em >= (select t from ini) and m.criado_em < (select t from fim) and not m.automatica
    union
    select cv.perfil_id from public.curriculos cv
     where cv.atualizado_em >= (select t from ini) and cv.atualizado_em < (select t from fim)
    union
    select u.id from auth.users u where u.created_at >= (select t from ini) and u.created_at < (select t from fim)
  )
  select jsonb_build_object(
    'ativos', count(*),
    'procuram', count(*) filter (where p.tipo = 'pessoa'),
    'contratam', count(*) filter (where p.tipo in ('empresa', 'comercio', 'agencia'))
  )
    from uso
    join auth.users u on u.id = uso.conta_id
    left join public.perfis p on p.id = uso.conta_id
   where uso.conta_id not in (select conta_id from fora)
$$;
revoke execute on function privado.ativos_entre(date, date, boolean) from public, anon, authenticated;

create or replace function public.admin_indicadores(p_dias integer default 7, p_com_equipe boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dias integer := case when p_dias in (7, 30, 90) then p_dias else 7 end;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  t_hoje timestamptz := hoje::timestamp at time zone 'America/Sao_Paulo';
  t_ini timestamptz := (hoje - dias)::timestamp at time zone 'America/Sao_Paulo';
  t_antes timestamptz := (hoje - 2 * dias)::timestamp at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_admin();
  return jsonb_build_object(
    'dias', dias,
    'de', hoje - dias,
    'ate', hoje - 1,
    'antes_de', hoje - 2 * dias,
    'antes_ate', hoje - dias - 1,
    'com_equipe', p_com_equipe,
    'atual', privado.indicadores_entre(t_ini, t_hoje, p_com_equipe)
             || privado.ativos_entre(hoje - dias, hoje - 1, p_com_equipe),
    'antes', privado.indicadores_entre(t_antes, t_ini, p_com_equipe)
             || privado.ativos_entre(hoje - 2 * dias, hoje - dias - 1, p_com_equipe),
    'hoje', privado.indicadores_entre(t_hoje, now(), p_com_equipe),
    -- desde quando há dado: o primeiro visitante contado e a primeira conta
    'visitantes_desde', (select min(s.dia) from privado.acessos_site s),
    'contas_desde', (select (min(u.created_at) at time zone 'America/Sao_Paulo')::date from auth.users u)
  );
end
$$;
revoke execute on function public.admin_indicadores(integer, boolean) from public, anon, authenticated;
grant execute on function public.admin_indicadores(integer, boolean) to service_role;

-- Oferta e procura: por área (categoria), por cidade e por bairro de Goiânia. As vagas no ar e as sem candidato
-- (no ar há mais de 24 h, sem nenhuma candidatura) são de agora; as vagas novas, as candidaturas e o tempo até o
-- primeiro candidato são dos últimos `dias` dias.
create or replace function public.admin_oferta_procura(p_dias integer default 30, p_com_equipe boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dias integer := case when p_dias in (7, 30, 90) then p_dias else 30 end;
  v jsonb;
begin
  perform privado.exigir_admin();
  with
  fora as (select f.conta_id from privado.contas_fora_dos_numeros() f where not p_com_equipe),
  vagas as (
    select a.id, coalesce(nullif(a.categoria, ''), 'outros') as categoria, coalesce(a.cidade, '') as cidade,
           coalesce(a.bairro, '') as bairro, a.criado_em,
           a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null as no_ar,
           (select count(*) from public.curtidas c where c.anuncio_id = a.id
               and c.perfil_id not in (select conta_id from fora)) as candidatos,
           (select count(*) from public.curtidas c where c.anuncio_id = a.id
               and c.criado_em > now() - make_interval(days => dias)
               and c.perfil_id not in (select conta_id from fora)) as candidaturas_periodo,
           (select min(c.criado_em) from public.curtidas c where c.anuncio_id = a.id
               and c.perfil_id not in (select conta_id from fora)) as primeiro
      from public.anuncios a
     where a.tipo = 'vaga' and a.status <> 'removido' and a.autor_id not in (select conta_id from fora)
  ),
  linhas as (
    select g.grupo, g.chave,
           count(*) filter (where vg.no_ar) as no_ar,
           count(*) filter (where vg.criado_em > now() - make_interval(days => dias)) as novas,
           coalesce(sum(vg.candidaturas_periodo), 0) as candidaturas,
           count(*) filter (where vg.no_ar and vg.candidatos = 0 and vg.criado_em < now() - interval '24 hours') as sem_candidato,
           round((percentile_cont(0.5) within group (order by extract(epoch from vg.primeiro - vg.criado_em) / 3600)
                   filter (where vg.primeiro is not null and vg.criado_em > now() - make_interval(days => dias)))::numeric, 1)
             as horas_primeiro
      from vagas vg
      cross join lateral (values ('area', vg.categoria), ('cidade', vg.cidade),
                                 ('bairro', case when vg.cidade = 'Goiânia' then vg.bairro end)) g(grupo, chave)
     where coalesce(g.chave, '') <> ''
     group by g.grupo, g.chave
  )
  select jsonb_build_object(
    'dias', dias,
    'areas', coalesce((select jsonb_agg(to_jsonb(l) - 'grupo' order by l.no_ar desc, l.candidaturas desc)
                         from linhas l where l.grupo = 'area' and (l.no_ar > 0 or l.novas > 0)), '[]'::jsonb),
    'cidades', coalesce((select jsonb_agg(to_jsonb(l) - 'grupo' order by l.no_ar desc, l.candidaturas desc)
                           from linhas l where l.grupo = 'cidade' and (l.no_ar > 0 or l.novas > 0)), '[]'::jsonb),
    'bairros', coalesce((select jsonb_agg(to_jsonb(x) - 'grupo')
                           from (select * from linhas l where l.grupo = 'bairro' and (l.no_ar > 0 or l.novas > 0)
                                  order by l.no_ar desc, l.candidaturas desc limit 15) x), '[]'::jsonb)
  ) into v;
  return v;
end
$$;
revoke execute on function public.admin_oferta_procura(integer, boolean) from public, anon, authenticated;
grant execute on function public.admin_oferta_procura(integer, boolean) to service_role;

-- O menu do admin só mostra 2 números: as denúncias abertas e a fila da IA.
create or replace function public.admin_numeros_do_menu()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return jsonb_build_object(
    'denuncias_abertas', (select count(*) from public.denuncias d where d.status = 'aberta'),
    'fila_ia', (select count(*) from privado.fila_ia)
  );
end
$$;
revoke execute on function public.admin_numeros_do_menu() from public, anon, authenticated;
grant execute on function public.admin_numeros_do_menu() to service_role;

-- Equipe › Números: os mesmos números, pela porta do painel_no_site (o aviso só na própria transação).
create or replace function public.painel_no_site_indicadores(p_dias integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not privado.pode_ver_painel_no_site() then
    raise exception 'Só a equipe do Publike vê o painel.' using errcode = '42501';
  end if;
  perform set_config('publike.painel_no_site', 'sim', true);
  v := jsonb_build_object(
    'indicadores', public.admin_indicadores(p_dias, false),
    'oferta', public.admin_oferta_procura(case when p_dias in (7, 30, 90) then p_dias else 30 end, false)
  );
  perform set_config('publike.painel_no_site', '', true);
  return v;
exception when others then
  perform set_config('publike.painel_no_site', '', true);
  raise;
end
$$;
revoke execute on function public.painel_no_site_indicadores(integer) from public, anon;
grant execute on function public.painel_no_site_indicadores(integer) to authenticated;

notify pgrst, 'reload schema';
