-- O aviso de vaga nova pelo WhatsApp e as vagas que já foram (25/11/2026; Marcelo, com a conversa do Cleiton: "nao pode
-- repetir a sugestao de vaga, deve informar que nao tem e sugerir vagas correlacionadas, assim dá uma ideia de
-- descredibilidade" e "preciso avisar todos os usuários pelo whatsapp, quando entrar uma vaga que ele já procurou").
-- Pode rodar de novo.
--
-- 1. As vagas que já foram para uma conversa (privado.vagas_da_conversa): os links que o robô e a equipe mandaram nos
--    últimos 60 dias, os avisos de vaga nova e as vagas em que a conta do número se candidatou. Antes, o atendimento só
--    olhava as 12 últimas mensagens: com as 4 perguntas da candidatura no meio, a vaga do Cleiton voltou 4 minutos
--    depois, entre as "mais longe", já com a candidatura feita.
-- 2. O que cada pessoa procurou (privado.whatsapp_procuras): a função e o lugar de cada busca da conversa, guardados
--    60 dias. As buscas desde 22/11 (privado.procuras, só com a impressão da conversa) entram aqui.
-- 3. O robô das filas (servidor_avisos_de_vaga_para_mandar, uma rodada a cada 5 minutos): das 8h às 20h, a vaga
--    publicada depois da busca (a busca dos últimos 30 dias, a vaga de até 3 dias), da função procurada, a até 30 km do
--    lugar (ou na mesma cidade), que ainda não foi para a conversa. Um aviso por dia por pessoa, com o teto do dia
--    (config_whatsapp.avisos_vaga_por_dia). Não vai para quem disse PARAR, para conversa de quem contrata, com a equipe
--    ou que andou nas últimas 2 horas. Liga e desliga como os outros avisos, em Admin › WhatsApp › Parâmetros (o tipo
--    "aviso_de_vaga" em tipos_desligados).
-- 4. PARAR também para os avisos de vaga nova (whatsapp_conversas.avisos_parados_em).

-- 1. O teto do dia ----------------------------------------------------------------------------------------------------

alter table privado.config_whatsapp add column if not exists avisos_vaga_por_dia integer not null default 100;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'config_whatsapp_avisos_vaga_por_dia_check') then
    alter table privado.config_whatsapp
      add constraint config_whatsapp_avisos_vaga_por_dia_check check (avisos_vaga_por_dia between 0 and 5000);
  end if;
end
$$;

alter table privado.whatsapp_conversas add column if not exists avisos_parados_em timestamptz;

-- 2. O que cada pessoa procurou e os avisos que foram ------------------------------------------------------------------

create table if not exists privado.whatsapp_procuras (
  conversa text not null references privado.whatsapp_conversas (chave) on delete cascade,
  funcao text not null check (char_length(funcao) between 3 and 60),
  funcao_norma text not null,
  cidade text check (cidade is null or char_length(cidade) <= 60),
  regiao text check (regiao is null or char_length(regiao) <= 60),
  bairro text check (bairro is null or char_length(bairro) <= 80),
  lat double precision,
  lng double precision,
  procurada_em timestamptz not null default now(),
  primary key (conversa, funcao_norma)
);
create index if not exists whatsapp_procuras_procurada_idx on privado.whatsapp_procuras (procurada_em desc);
alter table privado.whatsapp_procuras enable row level security;
revoke all on privado.whatsapp_procuras from public, anon, authenticated;

create table if not exists privado.whatsapp_avisos_de_vaga (
  conversa text not null references privado.whatsapp_conversas (chave) on delete cascade,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  -- pelo modelo da Meta (fora das 24 horas) ou pela mensagem de sempre (dentro delas)
  pelo_modelo boolean not null default false,
  wamid text,
  -- a Meta recusou (o número fora do WhatsApp, o limite de marketing da pessoa): não tenta de novo no mesmo dia
  falhou text check (falhou is null or char_length(falhou) <= 300),
  mandado_em timestamptz not null default now(),
  primary key (conversa, anuncio_id)
);
create index if not exists whatsapp_avisos_de_vaga_mandado_idx on privado.whatsapp_avisos_de_vaga (mandado_em desc);
alter table privado.whatsapp_avisos_de_vaga enable row level security;
revoke all on privado.whatsapp_avisos_de_vaga from public, anon, authenticated;

-- as buscas desde 22/11 (a impressão é md5('procura|' || a chave da conversa)), sem o ponto: a cidade vale
insert into privado.whatsapp_procuras (conversa, funcao, funcao_norma, cidade, regiao, procurada_em)
select distinct on (cv.chave, p.funcao_norma) cv.chave, p.funcao, p.funcao_norma, p.cidade, p.regiao, p.criado_em
  from privado.procuras p
  join privado.whatsapp_conversas cv on md5('procura|' || cv.chave) = p.quem
 where p.origem = 'whatsapp' and p.criado_em > now() - interval '60 days'
 order by cv.chave, p.funcao_norma, p.criado_em desc
on conflict (conversa, funcao_norma) do update
  set procurada_em = greatest(privado.whatsapp_procuras.procurada_em, excluded.procurada_em);

-- 3. As vagas que já foram para a conversa ------------------------------------------------------------------------------

create or replace function privado.vagas_da_conversa(p_conversa text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct y.codigo), '{}')
    from (
      -- os links das vagas que o robô e a equipe mandaram (/anuncio/<id> e os curtos /w/, /i/, /f/ e /m/)
      select coalesce(x[1], x[2]) as codigo
        from privado.whatsapp_conversa_mensagens m,
             lateral regexp_matches(m.texto, '/(?:anuncio/([0-9a-f]{8})[0-9a-f-]{28}|[wifm]/([0-9a-f]{8}))', 'g') x
       where m.chave = p_conversa and m.de <> 'pessoa' and m.criado_em > now() - interval '60 days'
      union all
      -- os avisos de vaga nova (os que saíram)
      select left(a.anuncio_id::text, 8) from privado.whatsapp_avisos_de_vaga a
       where a.conversa = p_conversa and a.falhou is null
      union all
      -- as vagas em que a conta deste número se candidatou (pela conversa ou pelo site)
      select left(cu.anuncio_id::text, 8)
        from privado.whatsapp_conversas cv
        join auth.users u on u.phone = privado.telefone_do_login(cv.numero)
        join public.curtidas cu on cu.perfil_id = u.id
       where cv.chave = p_conversa
    ) y
   where y.codigo is not null
$$;

create or replace function public.servidor_whatsapp_vagas_da_conversa(p_chave text, p_conversa text)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return privado.vagas_da_conversa(p_conversa);
end
$$;

-- 4. A busca guardada (o atendimento, a cada busca com função) ----------------------------------------------------------

create or replace function public.servidor_guardar_procura_whatsapp(
  p_chave text, p_conversa text, p_funcoes text[], p_cidade text, p_regiao text, p_bairro text,
  p_lat double precision default null, p_lng double precision default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  f text;
  n integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  if not exists (select 1 from privado.whatsapp_conversas c where c.chave = p_conversa) then
    return 0;
  end if;
  foreach f in array coalesce(p_funcoes[1:3], '{}') loop
    f := left(regexp_replace(btrim(coalesce(f, '')), '\s+', ' ', 'g'), 60);
    continue when char_length(f) < 3;
    insert into privado.whatsapp_procuras as w (conversa, funcao, funcao_norma, cidade, regiao, bairro, lat, lng, procurada_em)
    values (p_conversa, f, lower(public.sem_acento(f)),
            nullif(left(btrim(coalesce(p_cidade, '')), 60), ''), nullif(left(btrim(coalesce(p_regiao, '')), 60), ''),
            nullif(left(btrim(coalesce(p_bairro, '')), 80), ''),
            case when p_lat between -90 and 90 and p_lng between -180 and 180 then p_lat end,
            case when p_lat between -90 and 90 and p_lng between -180 and 180 then p_lng end, now())
    on conflict (conversa, funcao_norma) do update
      set funcao = excluded.funcao, cidade = excluded.cidade, regiao = excluded.regiao, bairro = excluded.bairro,
          lat = excluded.lat, lng = excluded.lng, procurada_em = now();
    n := n + 1;
  end loop;
  -- de vez em quando, o que passou de 90 dias sai
  if random() < 0.01 then
    delete from privado.whatsapp_procuras w where w.procurada_em < now() - interval '90 days';
  end if;
  return n;
end
$$;

-- o atendimento promete o aviso só com ele ligado, para a conversa que não disse PARAR e, no modo de teste, só para os
-- números da lista
create or replace function public.servidor_avisos_de_vaga_ligado(p_chave text, p_conversa text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_whatsapp c where c.id;
  if not found or not cfg.ativo or 'aviso_de_vaga' = any (cfg.tipos_desligados) or cfg.avisos_vaga_por_dia <= 0 then
    return false;
  end if;
  if p_conversa is null then
    return true;
  end if;
  return exists (select 1 from privado.whatsapp_conversas cv
                  where cv.chave = p_conversa and cv.avisos_parados_em is null
                    and (cfg.para_todos or privado.chave_do_numero(cv.numero) = any (
                           select privado.chave_do_numero(t) from unnest(cfg.numeros_teste) t)));
end
$$;

-- 5. O robô: os avisos que estão na hora ---------------------------------------------------------------------------------

-- as raízes das palavras da função, pela mesma regra de privado.titulo_da_funcao (o começo de cada palavra, sem as
-- pequenas): a vaga é da função quando o título sem acento tem todas. Separadas para o robô cruzar milhares de buscas com
-- as vagas novas sem chamar a função a cada par (uns 25 µs cada). Mudou a regra de lá, mude aqui.
create or replace function privado.raizes_da_funcao(p_funcao text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(left(w, greatest(5, char_length(w) - 3))), '{}')
    from unnest(regexp_split_to_array(lower(public.sem_acento(coalesce(p_funcao, ''))), '[^a-z0-9]+')) w
   where char_length(w) > 2 and w not in ('dos', 'das', 'para', 'com', 'uma', 'umas', 'uns')
$$;
revoke execute on function privado.raizes_da_funcao(text) from public, anon, authenticated;

-- a última rodada do robô (uma a cada 5 minutos)
create table if not exists privado.avisos_de_vaga_rodada (
  id boolean primary key default true check (id),
  em timestamptz not null default now()
);
alter table privado.avisos_de_vaga_rodada enable row level security;
revoke all on privado.avisos_de_vaga_rodada from public, anon, authenticated;

create or replace function public.servidor_avisos_de_vaga_para_mandar(p_chave text, p_limite integer default 30,
                                                                       p_agora boolean default false)
returns table (conversa text, numero text, nome text, anuncio_id uuid, titulo text, funcao text, bairro text,
               cidade text, outras integer, na_janela boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
  hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
  v_hoje integer;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_whatsapp c where c.id;
  if not found or not cfg.ativo or 'aviso_de_vaga' = any (cfg.tipos_desligados) then
    return;
  end if;
  -- das 8h às 20h
  if not coalesce(p_agora, false) and (hora < 8 or hora >= 20) then
    return;
  end if;
  select count(*) into v_hoje from privado.whatsapp_avisos_de_vaga a
   where a.falhou is null
     and a.mandado_em >= ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
  if v_hoje >= cfg.avisos_vaga_por_dia then
    return;
  end if;
  -- uma rodada a cada 5 minutos (o p_agora, dos testes, não espera)
  if not coalesce(p_agora, false) then
    insert into privado.avisos_de_vaga_rodada as r (id, em) values (true, now())
    on conflict (id) do update set em = now() where r.em < now() - interval '4 minutes 30 seconds';
    if not found then
      return;
    end if;
  end if;
  return query
  -- quem disse PARAR para os avisos das contas (o número sem o nono dígito, uma vez só)
  with paradas as materialized (
    select distinct privado.chave_do_numero(w.numero) as chave
      from privado.whatsapp_permissoes w where w.cancelado_em is not null
  ),
  -- as conversas que podem receber agora
  elegiveis as materialized (
    select cv.chave, cv.numero, cv.nome, cv.ultima_da_pessoa_em
      from privado.whatsapp_conversas cv
     where cv.avisos_parados_em is null
       and cv.perfil is distinct from 'contratar'
       and cv.situacao = 'robo'
       -- a conversa que andou há pouco não é interrompida
       and cv.ultima_em < now() - interval '2 hours'
       -- o modo de teste: só os números da lista
       and (cfg.para_todos or privado.chave_do_numero(cv.numero) = any (
              select privado.chave_do_numero(t) from unnest(cfg.numeros_teste) t))
       and not exists (select 1 from paradas pa where pa.chave = cv.chave)
       -- com busca nos últimos 30 dias
       and exists (select 1 from privado.whatsapp_procuras p
                    where p.conversa = cv.chave and p.procurada_em > now() - interval '30 days')
       -- um aviso por dia (o que a Meta recusou também conta: tenta amanhã)
       and not exists (select 1 from privado.whatsapp_avisos_de_vaga x
                        where x.conversa = cv.chave and x.mandado_em > now() - interval '20 hours')
  ),
  -- as buscas dos últimos 30 dias dessas conversas, com as raízes das palavras da função
  buscas as materialized (
    select p.conversa, e.numero, e.nome, e.ultima_da_pessoa_em, p.funcao, lower(public.sem_acento(p.cidade)) as cidade_norma,
           p.lat, p.lng, p.procurada_em, privado.raizes_da_funcao(p.funcao) as raizes
      from privado.whatsapp_procuras p
      join elegiveis e on e.chave = p.conversa
     where p.procurada_em > now() - interval '30 days'
  ),
  -- as vagas no ar publicadas nos últimos 3 dias, com o título e a cidade sem acento e o ponto em graus
  novas as materialized (
    select a.id, a.titulo, a.bairro, a.cidade, a.criado_em, lower(public.sem_acento(a.titulo)) as t,
           lower(public.sem_acento(a.cidade)) as cidade_norma,
           case when a.local is not null then extensions.st_y(a.local::extensions.geometry) end as lat,
           case when a.local is not null then extensions.st_x(a.local::extensions.geometry) end as lng
      from public.anuncios a
     where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null and a.criado_em > now() - interval '3 days'
  ),
  -- as funções procuradas (as raízes), uma vez cada
  funcoes as materialized (
    select distinct b.raizes from buscas b where cardinality(b.raizes) > 0
  ),
  -- a vaga é da função (privado.titulo_da_funcao, pelas raízes): uma vez por função, e não por busca
  casam as materialized (
    select f.raizes, n.id, n.titulo, n.bairro, n.cidade, n.criado_em, n.cidade_norma, n.lat, n.lng
      from funcoes f
      cross join novas n
     where position(f.raizes[1] in n.t) > 0
       and not exists (select 1 from unnest(f.raizes) x where position(x in n.t) = 0)
  ),
  -- publicada depois da busca e perto: a até 30 km do ponto da busca (a conta plana, em km, que basta para 30 km); sem
  -- o ponto, na mesma cidade; sem lugar nenhum, qualquer uma
  candidatas as materialized (
    select b.conversa, b.numero, b.nome, b.ultima_da_pessoa_em, b.funcao, c.id, c.titulo, c.bairro, c.cidade, c.criado_em,
           case when b.lat is not null and c.lat is not null
                then 111.32 * sqrt(power(c.lat - b.lat, 2) + power((c.lng - b.lng) * cos(radians(b.lat)), 2)) end
             as distancia
      from buscas b
      join casam c on c.raizes = b.raizes
     where c.criado_em > b.procurada_em
       and case when b.lat is not null and c.lat is not null
                then abs(c.lat - b.lat) < 0.3
                     and 111.32 * sqrt(power(c.lat - b.lat, 2) + power((c.lng - b.lng) * cos(radians(b.lat)), 2)) <= 30
                when b.cidade_norma is not null and c.cidade_norma is not null
                then b.cidade_norma = c.cidade_norma
                else true end
  ),
  -- as vagas que já foram para cada conversa (uma vez por conversa), uma por linha
  foram as materialized (
    select c.chave, f.codigo
      from (select distinct x.conversa as chave from candidatas x) c
      cross join lateral unnest(privado.vagas_da_conversa(c.chave)) as f(codigo)
  ),
  -- uma linha por vaga (a vaga pode servir a duas funções procuradas)
  livres as (
    select distinct on (x.conversa, x.id) x.*
      from candidatas x
     where not exists (select 1 from foram f where f.chave = x.conversa and f.codigo = left(x.id::text, 8))
     order by x.conversa, x.id, x.distancia nulls last
  ),
  -- a mais perto (e a mais nova) de cada conversa; `mais`, as outras dela
  uma as (
    select distinct on (l.conversa) l.*, (count(*) over (partition by l.conversa))::integer - 1 as mais
      from livres l
     order by l.conversa, l.distancia nulls last, l.criado_em desc
  )
  select u.conversa, u.numero, u.nome, u.id, u.titulo, u.funcao, u.bairro, u.cidade, u.mais,
         coalesce(u.ultima_da_pessoa_em > now() - interval '23 hours', false)
    from uma u
   order by u.criado_em desc
   limit greatest(least(coalesce(p_limite, 30), 100, cfg.avisos_vaga_por_dia - v_hoje), 0);
end
$$;

-- o aviso que saiu (a mensagem fica na conversa pelo servidor_whatsapp_conversa_saida), ou o que a Meta recusou
-- (`p_falhou`: o porquê; a conversa espera o dia seguinte, e a vaga pode ir de novo)
create or replace function public.servidor_aviso_de_vaga_mandado(p_chave text, p_conversa text, p_anuncio uuid,
                                                                  p_pelo_modelo boolean, p_wamid text default null,
                                                                  p_falhou text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.whatsapp_avisos_de_vaga as w (conversa, anuncio_id, pelo_modelo, wamid, falhou)
  values (p_conversa, p_anuncio, coalesce(p_pelo_modelo, false), left(p_wamid, 200), nullif(left(p_falhou, 300), ''))
  on conflict (conversa, anuncio_id) do update
    set pelo_modelo = excluded.pelo_modelo, wamid = excluded.wamid, falhou = excluded.falhou, mandado_em = now()
    where w.falhou is not null;
end
$$;

-- 6. PARAR também para os avisos de vaga nova -----------------------------------------------------------------------

do $$
declare
  f text;
  antes text;
begin
  f := pg_get_functiondef('public.servidor_whatsapp_recebida'::regproc);
  if strpos(f, 'avisos_parados_em') = 0 then
    antes := f;
    -- antes do update das permissões (o row_count dele vira o "contas" da resposta)
    f := replace(f,
      '    update privado.whatsapp_permissoes w' || E'\n' || '       set cancelado_em = now(), cancelado_por = ''whatsapp''' || E'\n',
      '    -- e os avisos de vaga nova da conversa (migração 20271005120000)' || E'\n'
      || '    update privado.whatsapp_conversas cv set avisos_parados_em = coalesce(cv.avisos_parados_em, now())' || E'\n'
      || '     where cv.chave = v_chave;' || E'\n'
      || '    update privado.whatsapp_permissoes w' || E'\n' || '       set cancelado_em = now(), cancelado_por = ''whatsapp''' || E'\n');
    if f = antes then
      raise exception 'servidor_whatsapp_recebida mudou: não achei o PARAR';
    end if;
    execute f;
  end if;
end
$$;

-- 7. O Admin (Admin › Procuradas sem vaga): o teto e os números ----------------------------------------------

create or replace function public.admin_avisos_de_vaga_whatsapp()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'ligado', not ('aviso_de_vaga' = any (c.tipos_desligados)),
      'por_dia', c.avisos_vaga_por_dia,
      'whatsapp_ativo', c.ativo,
      'hoje', (select count(*) from privado.whatsapp_avisos_de_vaga a
                where a.falhou is null
                  and a.mandado_em >= ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo'),
      'semana', (select count(*) from privado.whatsapp_avisos_de_vaga a
                  where a.mandado_em > now() - interval '7 days' and a.falhou is null),
      'semana_modelo', (select count(*) from privado.whatsapp_avisos_de_vaga a
                         where a.mandado_em > now() - interval '7 days' and a.pelo_modelo and a.falhou is null),
      'semana_falhas', (select count(*) from privado.whatsapp_avisos_de_vaga a
                         where a.mandado_em > now() - interval '7 days' and a.falhou is not null),
      -- quem se candidatou depois do aviso (a conta do número curtiu a vaga do aviso)
      'semana_candidaturas', (select count(*) from privado.whatsapp_avisos_de_vaga a
                               join privado.whatsapp_conversas cv on cv.chave = a.conversa
                               join auth.users u on u.phone = privado.telefone_do_login(cv.numero)
                               join public.curtidas cu on cu.perfil_id = u.id and cu.anuncio_id = a.anuncio_id
                                                      and cu.criado_em >= a.mandado_em
                              where a.mandado_em > now() - interval '7 days' and a.falhou is null),
      'pessoas', (select count(distinct p.conversa) from privado.whatsapp_procuras p
                   join privado.whatsapp_conversas cv on cv.chave = p.conversa
                  where p.procurada_em > now() - interval '30 days' and cv.avisos_parados_em is null),
      'pararam', (select count(*) from privado.whatsapp_conversas cv where cv.avisos_parados_em is not null))
      from privado.config_whatsapp c where c.id);
end
$$;

create or replace function public.admin_salvar_avisos_de_vaga_whatsapp(p_por_dia integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  if p_por_dia is not null and (p_por_dia < 0 or p_por_dia > 5000) then
    raise exception 'O teto do dia vai de 0 a 5.000 avisos.' using errcode = '22023';
  end if;
  update privado.config_whatsapp
     set avisos_vaga_por_dia = coalesce(p_por_dia, avisos_vaga_por_dia),
         atualizado_em = now(), atualizado_por = auth.uid()
   where id;
end
$$;

-- 8. As permissões --------------------------------------------------------------------------------------------------

revoke execute on function privado.vagas_da_conversa(text) from public, anon, authenticated;
revoke execute on function
  public.servidor_whatsapp_vagas_da_conversa(text, text),
  public.servidor_guardar_procura_whatsapp(text, text, text[], text, text, text, double precision, double precision),
  public.servidor_avisos_de_vaga_ligado(text, text),
  public.servidor_avisos_de_vaga_para_mandar(text, integer, boolean),
  public.servidor_aviso_de_vaga_mandado(text, text, uuid, boolean, text, text),
  public.admin_avisos_de_vaga_whatsapp(),
  public.admin_salvar_avisos_de_vaga_whatsapp(integer)
from public;
grant execute on function
  public.servidor_whatsapp_vagas_da_conversa(text, text),
  public.servidor_guardar_procura_whatsapp(text, text, text[], text, text, text, double precision, double precision),
  public.servidor_avisos_de_vaga_ligado(text, text),
  public.servidor_avisos_de_vaga_para_mandar(text, integer, boolean),
  public.servidor_aviso_de_vaga_mandado(text, text, uuid, boolean, text, text)
to anon, authenticated, service_role;
revoke execute on function public.admin_avisos_de_vaga_whatsapp(), public.admin_salvar_avisos_de_vaga_whatsapp(integer)
  from anon;
grant execute on function public.admin_avisos_de_vaga_whatsapp(), public.admin_salvar_avisos_de_vaga_whatsapp(integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271005120000_whatsapp_aviso_de_vaga_nova');
