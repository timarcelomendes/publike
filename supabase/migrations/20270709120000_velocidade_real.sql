-- A velocidade de verdade (17/11/2026, "deixe a performance invejável"): os Core Web Vitals de quem abre o site (LCP,
-- INP, CLS, FCP e TTFB), medidos no navegador pela biblioteca web-vitals (src/lib/velocidade-cliente.ts) e avisados
-- por /api/velocidade, uma vez por página aberta. É a mesma conta do Google (o "relatório de UX do Chrome", que
-- decide as Core Web Vitals da busca), mas por página e com a pista do culpado: o elemento do LCP, o toque mais lento
-- do INP e o que mais pulou no CLS, e as partes do tempo. Sem saber quem: a página é o caminho com [nome] (a regra de
-- privado.pagina_do_tempo), mais celular ou computador e a conexão (4g, 3g...). Guarda 60 dias. Admin › Velocidade.
-- Pode rodar de novo.

create table if not exists privado.velocidade (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  -- um código ao acaso de cada página aberta (o mesmo aviso pode chegar de novo, com o INP ou o CLS maiores)
  visita text not null check (visita ~ '^[a-z0-9]{8,24}$'),
  pagina text not null,
  metrica text not null check (metrica in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  -- ms (o CLS não tem unidade)
  valor double precision not null check (valor >= 0),
  nota text not null check (nota in ('good', 'needs-improvement', 'poor')),
  celular boolean not null,
  -- 4g, 3g, 2g, slow-2g (o que o navegador diz; nem todo navegador diz)
  conexao text check (conexao is null or conexao ~ '^[a-z0-9-]{1,12}$'),
  -- navigate, reload, back-forward, prerender, restore
  navegacao text check (navegacao is null or navegacao ~ '^[a-z-]{1,20}$'),
  -- o elemento: o do LCP, o tocado no INP, o que mais pulou no CLS (um seletor CSS curto)
  alvo text check (alvo is null or char_length(alvo) <= 160),
  -- as partes do tempo (números) e, no INP, o tipo do toque e o script mais longo
  partes jsonb not null default '{}'::jsonb
);
create unique index if not exists velocidade_visita on privado.velocidade (visita, metrica);
create index if not exists velocidade_quando on privado.velocidade (criado_em);
create index if not exists velocidade_metrica on privado.velocidade (metrica, criado_em);
alter table privado.velocidade enable row level security;
revoke all on table privado.velocidade from public, anon, authenticated;

-- o navegador avisa as medidas de uma página aberta (até 5, uma de cada); tudo conferido de novo aqui
create or replace function public.registrar_velocidade(
  p_visita text, p_pagina text, p_celular boolean, p_conexao text, p_navegacao text, p_medidas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pagina text := privado.pagina_do_tempo(p_pagina);
  m jsonb;
  v_partes jsonb;
  v_chave text;
  v_valor jsonb;
  v_metrica text;
  v_num double precision;
begin
  if v_pagina is null or p_celular is null or coalesce(p_visita, '') !~ '^[a-z0-9]{8,24}$'
     or jsonb_typeof(p_medidas) is distinct from 'array'
     or jsonb_array_length(p_medidas) = 0 or jsonb_array_length(p_medidas) > 5 then
    return;
  end if;
  -- trava contra enxurrada: no máximo 50 mil medidas por dia
  if (select count(*) from privado.velocidade v where v.criado_em > now() - interval '1 day') >= 50000 then
    return;
  end if;
  -- de vez em quando, apaga o que passou de 60 dias
  if random() < 0.01 then
    delete from privado.velocidade v where v.criado_em < now() - interval '60 days';
  end if;
  for m in select * from jsonb_array_elements(p_medidas) loop
    v_metrica := m ->> 'n';
    if v_metrica not in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB') or (m ->> 'v') !~ '^[0-9]+(\.[0-9]+)?$'
       or (m ->> 'r') not in ('good', 'needs-improvement', 'poor') then
      continue;
    end if;
    v_num := (m ->> 'v')::double precision;
    -- valores impossíveis ficam de fora (mais de 1 minuto, ou CLS acima de 10)
    if (v_metrica = 'CLS' and v_num > 10) or (v_metrica <> 'CLS' and v_num > 60000) then
      continue;
    end if;
    -- as partes: só números (arredondados) e os dois textos conhecidos, até 8 chaves
    v_partes := '{}'::jsonb;
    if jsonb_typeof(m -> 'x') = 'object' then
      for v_chave, v_valor in select * from jsonb_each(m -> 'x') limit 8 loop
        if v_chave !~ '^[a-zA-Z]{1,24}$' then
          continue;
        end if;
        if jsonb_typeof(v_valor) = 'number' and (v_valor #>> '{}')::double precision between 0 and 600000 then
          v_partes := v_partes || jsonb_build_object(v_chave, round((v_valor #>> '{}')::numeric, 3));
        elsif jsonb_typeof(v_valor) = 'string' and v_chave in ('tipo', 'carga', 'script', 'parte')
              and char_length(v_valor #>> '{}') <= 120 then
          v_partes := v_partes || jsonb_build_object(v_chave, v_valor #>> '{}');
        end if;
      end loop;
    end if;
    -- a mesma página aberta avisando de novo (o INP ou o CLS cresceram): fica o valor de agora
    insert into privado.velocidade as v (visita, pagina, metrica, valor, nota, celular, conexao, navegacao, alvo, partes)
    values (
      p_visita, v_pagina, v_metrica, v_num, m ->> 'r', p_celular,
      case when p_conexao ~ '^[a-z0-9-]{1,12}$' then p_conexao end,
      case when p_navegacao ~ '^[a-z-]{1,20}$' then p_navegacao end,
      nullif(left(m ->> 'a', 160), ''),
      v_partes)
    on conflict (visita, metrica) do update
      set valor = excluded.valor, nota = excluded.nota, alvo = excluded.alvo, partes = excluded.partes;
  end loop;
end
$$;
revoke execute on function public.registrar_velocidade(text, text, boolean, text, text, jsonb) from public;
grant execute on function public.registrar_velocidade(text, text, boolean, text, text, jsonb) to anon, authenticated;

-- Admin › Velocidade: o p75 (a conta do Google: 75% das visitas estão abaixo) de cada medida, no celular e no
-- computador; por página; e os culpados mais comuns (elementos do LCP, toques do INP e pulos do CLS)
create or replace function public.admin_velocidade(p_dias integer default 28)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_desde timestamptz := now() - make_interval(days => least(greatest(coalesce(p_dias, 28), 1), 60));
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike vê a velocidade.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'desde', (select min(v.criado_em) from privado.velocidade v),
    'resumo', coalesce((
      select jsonb_agg(jsonb_build_object(
               'metrica', x.metrica, 'celular', x.celular, 'n', x.n, 'p75', x.p75,
               'bom', x.bom, 'medio', x.medio, 'ruim', x.ruim) order by x.metrica, x.celular desc)
        from (select v.metrica, v.celular, count(*) as n,
                     percentile_cont(0.75) within group (order by v.valor) as p75,
                     count(*) filter (where v.nota = 'good') as bom,
                     count(*) filter (where v.nota = 'needs-improvement') as medio,
                     count(*) filter (where v.nota = 'poor') as ruim
                from privado.velocidade v
               where v.criado_em >= v_desde
               group by v.metrica, v.celular) x), '[]'::jsonb),
    'paginas', coalesce((
      select jsonb_agg(jsonb_build_object('pagina', x.pagina, 'metrica', x.metrica, 'n', x.n, 'p75', x.p75)
                       order by x.pagina, x.metrica)
        from (select v.pagina, v.metrica, count(*) as n,
                     percentile_cont(0.75) within group (order by v.valor) as p75
                from privado.velocidade v
               where v.criado_em >= v_desde and v.celular
               group by v.pagina, v.metrica
              having count(*) >= 3) x), '[]'::jsonb),
    'culpados', coalesce((
      select jsonb_agg(to_jsonb(y) order by y.metrica, y.ruins desc, y.n desc)
        from (select x.*, row_number() over (partition by x.metrica order by x.ruins desc, x.n desc) as ordem
                from (select v.metrica, v.alvo, mode() within group (order by v.pagina) as pagina,
                             count(*) as n,
                             count(*) filter (where v.nota <> 'good') as ruins,
                             percentile_cont(0.75) within group (order by v.valor) as p75,
                             mode() within group (order by v.partes ->> 'tipo') as tipo,
                             mode() within group (order by v.partes ->> 'script') as script,
                             mode() within group (order by v.partes ->> 'parte') as parte
                        from privado.velocidade v
                       where v.criado_em >= v_desde and v.alvo is not null and v.metrica in ('LCP', 'INP', 'CLS')
                       group by v.metrica, v.alvo) x) y
       where y.ordem <= 8), '[]'::jsonb));
end
$$;
revoke execute on function public.admin_velocidade(integer) from public, anon;
grant execute on function public.admin_velocidade(integer) to authenticated, service_role;

-- a tela na lista de Admin › Quem vê cada tela (só a equipe publike.org)
insert into privado.telas_do_admin (rota, somente_publike) values ('/admin/velocidade', true)
on conflict (rota) do nothing;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270709120000_velocidade_real');
