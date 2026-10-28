-- Tempo nas páginas (Admin › Painel e /equipe, nas Métricas de produto): quanto tempo cada página ficou na
-- tela, sem saber quem. O navegador conta só o tempo com a página visível e alguém mexendo (2 minutos sem
-- tocar, rolar, digitar nem mover o mouse param a conta), até 30 minutos por página, e avisa por /api/tempo
-- ao trocar de página, ao esconder o site e ao fechar (src/components/contar-tempo.tsx). O banco guarda só a
-- soma por dia e por página: o caminho com [nome] no lugar do que muda ("/anuncio/[id]"), nunca o endereço
-- inteiro, a conta, o IP ou o aparelho. Depois da 20261207120000 (o painel_no_site daqui leva as métricas).
-- Pode rodar de novo.

create table if not exists privado.tempo_paginas (
  dia date not null,
  pagina text not null,
  -- as vezes que a página ficou na tela (a partir de 1 segundo)
  visitas integer not null default 0,
  segundos bigint not null default 0,
  -- quantas passaram de 10 segundos e de 1 minuto (as outras saíram antes)
  mais_de_10s integer not null default 0,
  mais_de_1min integer not null default 0,
  primary key (dia, pagina)
);
alter table privado.tempo_paginas enable row level security;
revoke all on table privado.tempo_paginas from public, anon, authenticated;

-- A página que vale: "/", a "não encontrada" ou um caminho de partes fixas (letras e hífen) e partes que
-- mudam ("[id]"), até 6. Número, código, maiúscula e o que é de fora da conta (admin, rotas internas, o
-- painel da equipe) ficam de fora. A mesma regra de src/lib/tempo-na-pagina.ts.
create or replace function privado.pagina_do_tempo(p_pagina text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_pagina in ('/', '(não encontrada)') then p_pagina
    when length(p_pagina) <= 120
     and p_pagina ~ '^(/([a-z]+(-[a-z]+)*|\[[a-z]{1,20}\])){1,6}$'
     and p_pagina !~ '^/(admin|api|auth|embed|email|versao|pagina-que-nao-existe)(/|$)'
     and p_pagina <> '/equipe'
      then p_pagina
  end
$$;
revoke execute on function privado.pagina_do_tempo(text) from public;

-- Cada aviso traz os segundos que a página já tinha avisado (de) e os de agora (até): soma a diferença, e a
-- vez na tela conta só no primeiro aviso (de = 0). Passar de 10 s e de 1 min conta no aviso que passou.
create or replace function public.contar_tempo(p_pagina text, p_de integer, p_ate integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_pagina text := privado.pagina_do_tempo(p_pagina);
begin
  if v_pagina is null or p_de is null or p_ate is null or p_de < 0 or p_ate <= p_de or p_ate > 1800 then
    return;
  end if;
  -- o primeiro aviso do dia apaga o que passou de 400 dias
  if not exists (select 1 from privado.tempo_paginas t where t.dia = hoje) then
    delete from privado.tempo_paginas t where t.dia < hoje - 400;
  end if;
  -- mais de 300 páginas diferentes no mesmo dia: as novas entram juntas
  if not exists (select 1 from privado.tempo_paginas t where t.dia = hoje and t.pagina = v_pagina)
     and (select count(*) from privado.tempo_paginas t where t.dia = hoje) >= 300 then
    v_pagina := '(outras)';
  end if;
  insert into privado.tempo_paginas as t (dia, pagina, visitas, segundos, mais_de_10s, mais_de_1min)
  values (
    hoje,
    v_pagina,
    case when p_de = 0 then 1 else 0 end,
    p_ate - p_de,
    case when p_de < 10 and p_ate >= 10 then 1 else 0 end,
    case when p_de < 60 and p_ate >= 60 then 1 else 0 end
  )
  on conflict (dia, pagina) do update set
    visitas = t.visitas + excluded.visitas,
    segundos = t.segundos + excluded.segundos,
    mais_de_10s = t.mais_de_10s + excluded.mais_de_10s,
    mais_de_1min = t.mais_de_1min + excluded.mais_de_1min;
end
$$;
revoke execute on function public.contar_tempo(text, integer, integer) from public;
grant execute on function public.contar_tempo(text, integer, integer) to anon, authenticated;

-- Os números do Painel: os últimos 7 dias (até hoje) e os 7 antes, e as páginas onde as pessoas passam mais
-- tempo. "pessoas" são as que abriram o site em cada dia (as de "Quem abriu o site", privado.acessos_site),
-- só nos dias que este registro já conta, para o tempo por pessoa no dia.
create or replace function public.admin_tempo_paginas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  desde date;
  v jsonb;
begin
  perform privado.exigir_admin();
  select min(t.dia) into desde from privado.tempo_paginas t;

  with
  periodo as (
    select t.*, t.dia > hoje - 7 as nesta
      from privado.tempo_paginas t
     where t.dia > hoje - 14
  ),
  paginas as (
    select p.pagina, sum(p.visitas)::bigint as visitas, sum(p.segundos)::bigint as segundos,
           sum(p.mais_de_10s)::bigint as mais_de_10s, sum(p.mais_de_1min)::bigint as mais_de_1min
      from periodo p
     where p.nesta
     group by p.pagina
  )
  select jsonb_build_object(
    'desde', desde,
    'semana', (
      select jsonb_build_object(
        'visitas', coalesce(sum(p.visitas), 0), 'segundos', coalesce(sum(p.segundos), 0),
        'mais_de_10s', coalesce(sum(p.mais_de_10s), 0), 'mais_de_1min', coalesce(sum(p.mais_de_1min), 0),
        'pessoas', (select count(*) from privado.acessos_site a where a.dia > hoje - 7 and a.dia >= desde))
        from periodo p where p.nesta
    ),
    'antes', (
      select jsonb_build_object(
        'visitas', coalesce(sum(p.visitas), 0), 'segundos', coalesce(sum(p.segundos), 0),
        'mais_de_10s', coalesce(sum(p.mais_de_10s), 0), 'mais_de_1min', coalesce(sum(p.mais_de_1min), 0),
        'pessoas', (select count(*) from privado.acessos_site a
                     where a.dia > hoje - 14 and a.dia <= hoje - 7 and a.dia >= desde))
        from periodo p where not p.nesta
    ),
    'paginas', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.segundos desc, x.visitas desc), '[]'::jsonb)
        from (select * from paginas order by segundos desc, visitas desc limit 12) x
    ),
    'paginas_total', (select count(*) from paginas)
  ) into v;
  return v;
end
$$;
revoke execute on function public.admin_tempo_paginas() from public, anon, authenticated;
grant execute on function public.admin_tempo_paginas() to service_role;

-- o /equipe (a de 20261207120000, mais o tempo nas páginas)
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
    'tempo', public.admin_tempo_paginas(),
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
