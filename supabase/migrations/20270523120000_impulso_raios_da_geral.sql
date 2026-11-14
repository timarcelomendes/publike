-- Os raios das vagas impulsionadas na campanha geral (14/11/2026, claude/plano-raios-das-vagas-impulsionadas.md).
-- Pedidos do Marcelo: "Tem como adicionar alguns raios, exemplo: todo novo impulso, pega o ponto do estabelecimento e
-- coloca mais verba naquela regiao?", "super de acordo" (5 km e +50%) e "regioes que já possuem um CPC baixo pode ter um
-- lance até menor que 50%".
--
-- Cada pacote de candidatos no ar ganha, na campanha geral (a de `config_impulso.geral_campanha_id`), um raio em volta
-- da vaga com o lance maior. Onde o clique já sai barato, o lance a mais desce (até o mínimo). Acabou o pacote, o raio
-- sai. O robô (src/lib/servidor/raios-da-geral.ts) faz tudo; nasce desligado.
--
-- Pode rodar de novo.

alter table privado.config_impulso
  add column if not exists raios_ligados boolean not null default false,
  add column if not exists raio_km numeric(4, 1) not null default 5,
  add column if not exists raio_lance smallint not null default 50,
  add column if not exists raio_lance_minimo smallint not null default 10,
  add column if not exists raios_feita_em timestamptz,
  add column if not exists raios_erro text,
  add column if not exists raios_erro_em timestamptz;
alter table privado.config_impulso drop constraint if exists config_impulso_raio_km_check;
alter table privado.config_impulso add constraint config_impulso_raio_km_check check (raio_km between 3 and 30);
alter table privado.config_impulso drop constraint if exists config_impulso_raio_lance_check;
alter table privado.config_impulso add constraint config_impulso_raio_lance_check
  check (raio_lance between 0 and 300 and raio_lance_minimo between 0 and 300 and raio_lance_minimo <= raio_lance);

create table if not exists privado.raios_da_geral (
  impulso_id uuid primary key references privado.impulsos (id) on delete cascade,
  anuncio_id uuid not null,
  lat double precision not null,
  lng double precision not null,
  raio_km numeric(4, 1) not null,
  -- quanto a mais de lance agora (+50 = 50%)
  lance smallint not null,
  -- o critério do raio na campanha geral, no Google
  criterio_id text,
  -- fora: ainda não foi ao Google; ligado; tirado (o pacote acabou)
  situacao text not null default 'fora' check (situacao in ('fora', 'ligado', 'tirado')),
  -- os últimos 7 dias dentro do raio, na última medida
  vistas integer,
  cliques integer,
  custo numeric(10, 2),
  medido_em timestamptz,
  ligado_em timestamptz,
  tirado_em timestamptz,
  erro text,
  erro_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table privado.raios_da_geral enable row level security;
revoke all on privado.raios_da_geral from public, anon, authenticated;

-- o que o robô e o Admin precisam: a chave, o raio, os lances, a conta, os raios e os pacotes no ar com o ponto da vaga
create or replace function privado.raios_da_geral_dados()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ligados', c.raios_ligados,
    'km', c.raio_km,
    'lance', c.raio_lance,
    'minimo', c.raio_lance_minimo,
    'conta', c.geral_conta,
    'campanha_id', c.geral_campanha_id,
    'feita_em', c.raios_feita_em,
    'erro', c.raios_erro,
    'erro_em', c.raios_erro_em,
    'raios', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('titulo', i.titulo, 'cliente', p.nome)
                                        order by r.situacao, i.titulo)
                         from privado.raios_da_geral r
                         join privado.impulsos i on i.id = r.impulso_id
                         left join public.perfis p on p.id = i.conta_id
                        where r.situacao <> 'tirado' or r.tirado_em > now() - interval '7 days'), '[]'::jsonb),
    -- os pacotes no ar (os mesmos que somam verba à campanha geral), com o ponto da vaga
    'pacotes', coalesce((select jsonb_agg(jsonb_build_object(
                                  'impulso_id', i.id, 'anuncio_id', i.anuncio_id, 'titulo', i.titulo, 'cliente', p.nome,
                                  'lat', round(extensions.st_y(a.local::extensions.geometry)::numeric, 5),
                                  'lng', round(extensions.st_x(a.local::extensions.geometry)::numeric, 5)))
                           from privado.impulsos i
                           join public.anuncios a on a.id = i.anuncio_id
                           left join public.perfis p on p.id = i.conta_id
                          where i.produto = 'candidatos' and i.situacao = 'no_ar' and not i.pausar and i.ate > now()
                            and a.local is not null), '[]'::jsonb))
    from privado.config_impulso c where c.id
$$;

-- para o robô: os dados e se é hora. Ligado: na hora em que entra ou sai um pacote, e uma vez por dia depois das 6h (a
-- medida e o lance de cada raio). Desligado: só para tirar o que ficou. Depois de um erro, espera 1 hora.
create or replace function public.servidor_raios_da_geral(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  d jsonb;
  v_hoje_6h timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '06:00') at time zone 'America/Sao_Paulo';
  v_ligados uuid[];
  v_pacotes uuid[];
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_impulso where id;
  if c.id is null or c.geral_conta is null or c.geral_campanha_id is null then
    return jsonb_build_object('fazer', false);
  end if;
  d := privado.raios_da_geral_dados();
  select coalesce(array_agg(r.impulso_id), '{}') into v_ligados from privado.raios_da_geral r where r.situacao = 'ligado';
  select coalesce(array_agg((x ->> 'impulso_id')::uuid), '{}') into v_pacotes from jsonb_array_elements(d -> 'pacotes') x;
  return d || jsonb_build_object(
    'medir', c.raios_ligados and (c.raios_feita_em is null or (now() >= v_hoje_6h and c.raios_feita_em < v_hoje_6h)),
    'fazer', (c.raios_erro_em is null or c.raios_erro_em < now() - interval '1 hour')
             and ((c.raios_ligados and (c.raios_feita_em is null
                                        or (now() >= v_hoje_6h and c.raios_feita_em < v_hoje_6h)
                                        or not (v_pacotes <@ v_ligados and v_ligados <@ v_pacotes)))
                  or (not c.raios_ligados and cardinality(v_ligados) > 0)));
end
$$;

-- o robô guarda um raio (cria a linha na primeira vez; só muda o que veio)
create or replace function public.servidor_raio_da_geral(p_chave text, p_raio jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r jsonb := coalesce(p_raio, '{}'::jsonb);
  v_id uuid := (r ->> 'impulso_id')::uuid;
begin
  perform privado.exigir_servidor(p_chave);
  if v_id is null then
    raise exception 'Raio sem impulso.';
  end if;
  -- a linha nasce com o ponto; as voltas seguintes mandam só o que muda
  if not exists (select 1 from privado.raios_da_geral x where x.impulso_id = v_id) then
    insert into privado.raios_da_geral (impulso_id, anuncio_id, lat, lng, raio_km, lance)
    values (v_id, (r ->> 'anuncio_id')::uuid, (r ->> 'lat')::double precision, (r ->> 'lng')::double precision,
            (r ->> 'raio_km')::numeric, (r ->> 'lance')::smallint)
    on conflict (impulso_id) do nothing;
  end if;
  update privado.raios_da_geral x
     set anuncio_id = coalesce((r ->> 'anuncio_id')::uuid, x.anuncio_id),
         lat = coalesce((r ->> 'lat')::double precision, x.lat),
         lng = coalesce((r ->> 'lng')::double precision, x.lng),
         raio_km = coalesce((r ->> 'raio_km')::numeric, x.raio_km),
         lance = coalesce((r ->> 'lance')::smallint, x.lance),
         criterio_id = case when r ? 'criterio_id' then r ->> 'criterio_id' else x.criterio_id end,
         situacao = coalesce(r ->> 'situacao', x.situacao),
         vistas = case when r ? 'vistas' then (r ->> 'vistas')::int else x.vistas end,
         cliques = case when r ? 'cliques' then (r ->> 'cliques')::int else x.cliques end,
         custo = case when r ? 'custo' then (r ->> 'custo')::numeric else x.custo end,
         medido_em = case when r ? 'vistas' then now() else x.medido_em end,
         ligado_em = case when (r ->> 'situacao') = 'ligado' and x.situacao <> 'ligado' then now() else x.ligado_em end,
         tirado_em = case when (r ->> 'situacao') = 'tirado' and x.situacao <> 'tirado' then now() else x.tirado_em end,
         erro = case when r ? 'erro' then left(r ->> 'erro', 500) else x.erro end,
         erro_em = case when r ? 'erro' then (case when r ->> 'erro' is null then null else now() end) else x.erro_em end
   where x.impulso_id = v_id;
end
$$;

-- o robô terminou a volta (ou deu erro); `p_medida`: foi a volta do dia, com a medida
create or replace function public.servidor_raios_feita(p_chave text, p_erro text, p_medida boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if p_erro is not null then
    update privado.config_impulso set raios_erro = left(p_erro, 500), raios_erro_em = now() where id;
  elsif p_medida then
    update privado.config_impulso set raios_feita_em = now(), raios_erro = null, raios_erro_em = null where id;
  else
    update privado.config_impulso set raios_erro = null, raios_erro_em = null where id;
  end if;
end
$$;

-- o Admin: os mesmos dados
create or replace function public.admin_raios_da_geral()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_impulsos_admin();
  return privado.raios_da_geral_dados();
end
$$;

-- o Admin muda a chave, o raio e os lances; o robô age na volta seguinte (com a medida, para refazer os lances)
create or replace function public.admin_salvar_raios(p_config jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  v_km numeric := (p_config ->> 'km')::numeric;
  v_lance integer := (p_config ->> 'lance')::integer;
  v_minimo integer := (p_config ->> 'minimo')::integer;
begin
  perform privado.exigir_impulsos_admin();
  select * into c from privado.config_impulso where id;
  if v_km is not null and (v_km < 3 or v_km > 30) then
    return jsonb_build_object('erro', 'O raio vai de 3 a 30 km.');
  end if;
  if coalesce(v_lance, c.raio_lance) not between 0 and 300 or coalesce(v_minimo, c.raio_lance_minimo) not between 0 and 300 then
    return jsonb_build_object('erro', 'O lance a mais vai de 0% a 300%.');
  end if;
  if coalesce(v_minimo, c.raio_lance_minimo) > coalesce(v_lance, c.raio_lance) then
    return jsonb_build_object('erro', 'O lance mínimo não pode passar do lance a mais.');
  end if;
  update privado.config_impulso
     set raios_ligados = coalesce((p_config ->> 'ligados')::boolean, raios_ligados),
         raio_km = coalesce(v_km, raio_km),
         raio_lance = coalesce(v_lance, raio_lance),
         raio_lance_minimo = coalesce(v_minimo, raio_lance_minimo),
         raios_feita_em = null, raios_erro = null, raios_erro_em = null
   where id;
  perform privado.registrar('raios_da_geral', 'config', 'impulso', 'Raios da campanha geral', p_config);
  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function privado.raios_da_geral_dados() from public, anon, authenticated;
revoke execute on function public.servidor_raios_da_geral(text), public.servidor_raio_da_geral(text, jsonb),
  public.servidor_raios_feita(text, text, boolean), public.admin_raios_da_geral(), public.admin_salvar_raios(jsonb)
  from public, anon;
grant execute on function public.servidor_raios_da_geral(text), public.servidor_raio_da_geral(text, jsonb),
  public.servidor_raios_feita(text, text, boolean) to authenticated, service_role;
grant execute on function public.admin_raios_da_geral(), public.admin_salvar_raios(jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
