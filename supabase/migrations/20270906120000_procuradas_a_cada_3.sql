-- Procuradas sem vaga: um aviso novo a cada 3 pessoas a mais, e não um por semana (22/11/2026; Marcelo, com Admin ›
-- Procuradas sem vaga: "não pode limitar a um envio por semana, alcançou + 3, novo envio"). A conta recebe um aviso
-- quando alguma função dela ganhou pelo menos o mínimo de pessoas (3, no Admin) desde o último aviso que ela recebeu
-- (uma função nova conta desde zero). No máximo um por dia por conta, de segunda a sexta, das 9h às 18h. Para depois de
-- 3 avisos seguidos sem publicar nada (em 30 dias), como antes. O aviso guarda quantas pessoas cada função tinha.
--
-- Rode depois de 20270822120000_procuradas_sem_vaga.sql. Pode rodar de novo.

create table if not exists privado.procuras_avisos (
  id bigint generated always as identity primary key,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  -- [{funcao, pessoas}] de cada função no aviso
  itens jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists procuras_avisos_conta on privado.procuras_avisos (conta_id, criado_em desc);
alter table privado.procuras_avisos enable row level security;
revoke all on privado.procuras_avisos from public, anon, authenticated;

-- quem recebe (a mesma conta de antes) agora também com as funções e as pessoas de cada uma (`itens`)
drop function if exists privado.procuradas_destinatarios(integer, integer);
create or replace function privado.procuradas_destinatarios(p_dias integer, p_minimo integer)
returns table (conta_id uuid, nome text, tipo text, anuncio_id uuid, funcoes text[], texto text, itens jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with f as (
    select * from privado.procuradas_sem_vaga(p_dias, p_minimo)
  ),
  empresas as (
    select a.autor_id as conta_id, f.funcao, f.pessoas, f.cidades,
           (array_agg(a.id order by a.criado_em desc))[1] as anuncio_id
      from f
      join public.anuncios a on a.tipo = 'vaga' and a.criado_em > now() - interval '12 months'
                            and privado.titulo_da_funcao(a.titulo, f.funcao)
      join public.perfis p on p.id = a.autor_id and p.tipo in ('comercio', 'empresa')
     where (p.suspenso_ate is null or p.suspenso_ate <= now())
       and (cardinality(f.cidades) = 0 or a.cidade = any (f.cidades) or p.cidade = any (f.cidades))
       and not exists (select 1 from public.anuncios b
                        where b.autor_id = a.autor_id and b.tipo = 'vaga' and b.status = 'ativo' and b.expira_em > now()
                          and privado.titulo_da_funcao(b.titulo, f.funcao))
     group by a.autor_id, f.funcao, f.pessoas, f.cidades
  ),
  agencias as (
    select p.id as conta_id, f.funcao, f.pessoas, f.cidades, null::uuid as anuncio_id
      from f
      join public.perfis p on p.tipo = 'agencia'
     where (p.suspenso_ate is null or p.suspenso_ate <= now())
  ),
  todas as (
    select e.*, 'empresa' as tipo from empresas e
    union all
    select g.*, 'agencia' from agencias g
  ),
  por_conta as (
    select t.conta_id, t.tipo,
           (array_agg(t.anuncio_id order by t.pessoas desc) filter (where t.anuncio_id is not null))[1] as anuncio_id,
           array_agg(t.funcao order by t.pessoas desc, t.funcao) as funcoes,
           jsonb_agg(jsonb_build_object('funcao', t.funcao, 'pessoas', t.pessoas) order by t.pessoas desc, t.funcao) as itens,
           (select array_agg(distinct c) from todas t2, unnest(t2.cidades) c where t2.conta_id = t.conta_id) as cidades
      from todas t
     group by t.conta_id, t.tipo
  )
  select c.conta_id, p.nome, c.tipo, c.anuncio_id, c.funcoes[1:5],
         case
           when c.tipo = 'agencia' then
             'Nos últimos ' || p_dias || ' dias, estas funções foram procuradas no Publike e não tinham vaga no ar: '
             || privado.lista_de_procuradas((select jsonb_agg(x) from (select x from jsonb_array_elements(c.itens) x limit 5) y))
             || '. Se vocês têm vagas assim, publiquem aqui: a vaga aparece para quem procura essa função perto de casa.'
           when jsonb_array_length(c.itens) = 1 then
             'Nos últimos ' || p_dias || ' dias, ' || (c.itens -> 0 ->> 'pessoas')
             || case when (c.itens -> 0 ->> 'pessoas')::integer = 1 then ' pessoa procurou' else ' pessoas procuraram' end
             || ' vaga de '
             || (c.itens -> 0 ->> 'funcao') || ' no Publike'
             || case when cardinality(c.cidades) between 1 and 2 then ', em ' || array_to_string(c.cidades, ' e ') else '' end
             || ', e não havia vaga de ' || (c.itens -> 0 ->> 'funcao') || ' no ar. Vocês já anunciaram essa vaga aqui: se'
             || ' estiverem contratando, publiquem de novo, com a vaga de antes já preenchida.'
           else
             'Nos últimos ' || p_dias || ' dias, pessoas procuraram no Publike vagas que vocês já anunciaram aqui, e não'
             || ' havia nenhuma no ar: '
             || privado.lista_de_procuradas((select jsonb_agg(x) from (select x from jsonb_array_elements(c.itens) x limit 5) y))
             || '. Se estiverem contratando, publiquem de novo, com a vaga de antes já preenchida.'
         end,
         c.itens
    from por_conta c
    join public.perfis p on p.id = c.conta_id
   order by c.tipo desc, jsonb_array_length(c.itens) desc, p.nome
$$;
revoke all on function privado.procuradas_destinatarios(integer, integer) from public, anon, authenticated;

-- A conta tem novidade: alguma função com pelo menos p_minimo pessoas a mais que no último aviso (sem aviso, desde
-- zero); e nenhum aviso nas últimas 24 horas
create or replace function privado.procuradas_com_novidade(p_conta uuid, p_itens jsonb, p_minimo integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with ultimo as (
    select a.itens, a.criado_em from privado.procuras_avisos a
     where a.conta_id = p_conta order by a.criado_em desc limit 1
  )
  select coalesce((select u.criado_em < now() - interval '24 hours' from ultimo u), true)
     and exists (
       select 1 from jsonb_array_elements(p_itens) i
        where (i ->> 'pessoas')::integer
              - coalesce((select (x ->> 'pessoas')::integer from ultimo u, jsonb_array_elements(u.itens) x
                           where x ->> 'funcao' = i ->> 'funcao' limit 1), 0)
              >= greatest(coalesce(p_minimo, 3), 1))
$$;
revoke all on function privado.procuradas_com_novidade(uuid, jsonb, integer) from public, anon, authenticated;

-- os avisos de antes (um por semana) entram como o último de cada conta, com as pessoas de agora: quem já foi avisada
-- espera juntar o mínimo a mais
insert into privado.procuras_avisos (conta_id, itens, criado_em)
select v.conta_id,
       coalesce((select d.itens from privado.procuradas_destinatarios(c.dias, c.minimo) d where d.conta_id = v.conta_id),
                (select jsonb_agg(jsonb_build_object('funcao', f, 'pessoas', 0)) from unnest(v.funcoes) f), '[]'),
       v.criado_em
  from (select distinct on (x.conta_id) x.* from privado.procuras_avisadas x order by x.conta_id, x.criado_em desc) v
  cross join (select * from privado.config_procuradas where id) c
 where not exists (select 1 from privado.procuras_avisos a where a.conta_id = v.conta_id);

create or replace function public.servidor_avisar_procuradas(p_chave text, p_limite integer default 50, p_agora boolean default false)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_procuradas;
  agora_br timestamp := now() at time zone 'America/Sao_Paulo';
  v_semana date := date_trunc('week', now() at time zone 'America/Sao_Paulo')::date;
  r record;
  n integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_procuradas where id;
  if not found then
    return 0;
  end if;
  if not coalesce(p_agora, false) then
    if not cfg.ligado then
      return 0;
    end if;
    -- de segunda a sexta, das 9h às 18h
    if extract(isodow from agora_br) > 5 or extract(hour from agora_br) not between 9 and 17 then
      return 0;
    end if;
  end if;
  for r in
    select d.* from privado.procuradas_destinatarios(cfg.dias, cfg.minimo) d
     where privado.procuradas_com_novidade(d.conta_id, d.itens, cfg.minimo)
       -- 3 avisos seguidos sem publicar nada (30 dias): para
       and not ((select count(*) from privado.procuras_avisos v
                  where v.conta_id = d.conta_id and v.criado_em > now() - interval '30 days') >= 3
                and not exists (select 1 from public.anuncios a
                                 where a.autor_id = d.conta_id
                                   and a.criado_em > (select min(v.criado_em) from (
                                                        select v2.criado_em from privado.procuras_avisos v2
                                                         where v2.conta_id = d.conta_id
                                                         order by v2.criado_em desc limit 3) v)))
     limit greatest(1, least(coalesce(p_limite, 50), 200))
  loop
    insert into privado.procuras_avisos (conta_id, itens) values (r.conta_id, r.itens);
    -- o registro de antes (a semana), para quem ainda lê por ele
    insert into privado.procuras_avisadas (conta_id, semana, funcoes) values (r.conta_id, v_semana, r.funcoes)
    on conflict (conta_id, semana) do update set funcoes = excluded.funcoes;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    values (r.conta_id, 'procura_na_regiao', r.anuncio_id, r.texto,
            case when r.anuncio_id is not null then '/publicar?copiar=' || r.anuncio_id else '/publicar' end);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- O Admin: quem receberia agora (com novidade) e os avisos mandados (30 dias)
create or replace function public.admin_procuradas(p_dias integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg privado.config_procuradas;
  v_dias integer;
begin
  perform privado.exigir_admin();
  select * into cfg from privado.config_procuradas where id;
  v_dias := coalesce(p_dias, cfg.dias, 7);
  return jsonb_build_object(
    'config', jsonb_build_object('ligado', coalesce(cfg.ligado, false), 'minimo', coalesce(cfg.minimo, 3), 'dias', coalesce(cfg.dias, 7)),
    'dias', v_dias,
    'funcoes', coalesce((select jsonb_agg(jsonb_build_object('funcao', f.funcao, 'pessoas', f.pessoas, 'cidades', f.cidades,
                                                             'regioes', f.regioes) order by f.pessoas desc, f.funcao)
                           from privado.procuradas_sem_vaga(v_dias, 1) f), '[]'::jsonb),
    -- quem recebe, com o texto; `sem_novidade`: já recebeu e ainda não juntou o mínimo a mais (ou recebeu nas últimas 24 horas)
    'destinatarios', coalesce((select jsonb_agg(jsonb_build_object('conta_id', d.conta_id, 'nome', d.nome, 'tipo', d.tipo,
                                                                   'funcoes', d.funcoes, 'texto', d.texto,
                                                                   'sem_novidade', not privado.procuradas_com_novidade(d.conta_id, d.itens, cfg.minimo),
                                                                   'ultimo_aviso', (select max(a.criado_em) from privado.procuras_avisos a
                                                                                     where a.conta_id = d.conta_id)))
                                 from privado.procuradas_destinatarios(cfg.dias, cfg.minimo) d), '[]'::jsonb),
    'avisadas', coalesce((select jsonb_agg(jsonb_build_object('dia', a.criado_em,
                                                              'nome', p.nome, 'conta_id', a.conta_id,
                                                              'funcoes', (select coalesce(array_agg(x ->> 'funcao'), '{}')
                                                                            from jsonb_array_elements(a.itens) x))
                                           order by a.criado_em desc)
                            from privado.procuras_avisos a join public.perfis p on p.id = a.conta_id
                           where a.criado_em > now() - interval '30 days'), '[]'::jsonb),
    'registros', (select count(*) from privado.procuras_sem_vaga p where p.criado_em > now() - make_interval(days => v_dias))
  );
end
$$;

update public.modelos_email
   set descricao = 'Para empresas que já anunciaram a função (e não têm vaga dela no ar) e agências, quando uma função junta 3 pessoas procurando sem vaga, e de novo a cada 3 pessoas a mais (no máximo um por dia). Liga em Admin › Procuradas sem vaga.'
 where chave = 'procura_na_regiao';

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270906120000_procuradas_a_cada_3');
