-- Rota do currículo (claude/plano-base-de-empresas-da-receita.md, parte 2; fase D; 15/11/2026). Quem procura escolhe a
-- função e a distância de casa; o Publike lista os comércios (base da Receita, sem MEI) dos ramos que mais contratam
-- essa função em Goiás (Caged) e imprime uma cópia do currículo para cada lugar, com "Para: <lugar>" e um QR code
-- próprio. O dono do comércio escaneia e vê o currículo como está no papel (/cv/<código>), com o "Publique sua vaga
-- grátis". A pessoa fica sabendo quando uma cópia foi aberta e pode desligar a página de qualquer cópia.
--
-- O currículo da página do QR é uma cópia do que foi impresso (guardada na rota), não o currículo de agora: o dono do
-- comércio vê só o que a pessoa já entregou. Limites contra abuso: 3 rotas e 45 cópias por dia, 15 lugares por rota.
-- Pode rodar de novo.

create table if not exists privado.rotas_curriculo (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  cbo text check (cbo is null or cbo ~ '^[0-9]{6}$'),
  funcao text not null check (length(funcao) between 2 and 90),
  raio_km numeric(4, 1) not null check (raio_km > 0 and raio_km <= 10),
  lat double precision not null,
  lng double precision not null,
  -- o currículo como foi impresso: {nome, titulo, contato, whatsapp, email, cidade, bairro, experiencias, ...}
  curriculo jsonb not null check (jsonb_typeof(curriculo) = 'object' and length(curriculo::text) <= 20000),
  criada_em timestamptz not null default now()
);
create index if not exists rotas_curriculo_perfil_idx on privado.rotas_curriculo (perfil_id, criada_em desc);
alter table privado.rotas_curriculo enable row level security;
revoke all on privado.rotas_curriculo from public, anon, authenticated;

create table if not exists privado.copias_curriculo (
  codigo text primary key check (codigo ~ '^[a-z0-9]{10}$'),
  rota_id uuid not null references privado.rotas_curriculo (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  cnpj text not null,
  nome_local text not null,
  endereco text,
  bairro text,
  cidade text,
  distancia_m integer,
  ordem integer not null,
  entregue_em timestamptz,
  desligada boolean not null default false,
  aberturas integer not null default 0,
  aberta_em timestamptz,
  ultima_abertura timestamptz,
  criada_em timestamptz not null default now()
);
create index if not exists copias_curriculo_rota_idx on privado.copias_curriculo (rota_id, ordem);
create index if not exists copias_curriculo_perfil_idx on privado.copias_curriculo (perfil_id, criada_em desc);
create index if not exists copias_curriculo_cnpj_idx on privado.copias_curriculo (cnpj);
alter table privado.copias_curriculo enable row level security;
revoke all on privado.copias_curriculo from public, anon, authenticated;

-- 1. O aviso novo 'copia_aberta' (no sino, no grupo do andamento) ------------------------------------------------

do $$
declare
  d text;
  f text;
  antes text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'public.notificacoes'::regclass and c.conname = 'notificacoes_tipo_check';
  if strpos(d, '''copia_aberta''') = 0 then
    if strpos(d, '''vaga_venceu''::text') = 0 then
      raise exception 'notificacoes_tipo_check sem vaga_venceu (rode antes a 20270529120000): %', d;
    end if;
    d := replace(d, '''vaga_venceu''::text', '''vaga_venceu''::text, ''copia_aberta''::text');
    alter table public.notificacoes drop constraint notificacoes_tipo_check;
    execute 'alter table public.notificacoes add constraint notificacoes_tipo_check ' || d;
  end if;

  f := pg_get_functiondef('privado.grupo_do_aviso(text)'::regprocedure);
  if strpos(f, '''copia_aberta''') = 0 then
    antes := f;
    f := replace(f, '''vaga_vence'', ''vaga_venceu'') then ''andamento''',
                 '''vaga_vence'', ''vaga_venceu'', ''copia_aberta'') then ''andamento''');
    if f = antes then
      raise exception 'privado.grupo_do_aviso mudou: não achei a lista do andamento';
    end if;
    execute f;
  end if;
end
$$;

-- 2. Os lugares da rota: os ramos que mais contratam a função e os comércios deles perto de casa -------------------

create or replace function public.lugares_da_rota(
  p_cbo text, p_lat double precision, p_lng double precision, p_raio_km numeric default 2, p_limite integer default 60
)
returns table (
  cnpj text, nome text, ramo text, cnae text, endereco text, bairro text, cidade text,
  lat double precision, lng double precision, distancia_m integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raio numeric := least(greatest(coalesce(p_raio_km, 2), 0.5), 10);
  v_ponto extensions.geography;
begin
  if auth.uid() is null and not privado.eh_admin() then
    raise exception 'Entre para montar a rota.' using errcode = '42501';
  end if;
  if p_cbo !~ '^[0-9]{6}$' or p_lat is null or p_lng is null then
    return;
  end if;
  v_ponto := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  return query
    with ramos as (
      -- os ramos que somam a maior parte das contratações da função (no máximo 12, com 3 ou mais)
      select f.cnae from privado.ramos_funcoes f
       where f.cbo = p_cbo and f.contratacoes >= 3
       order by f.contratacoes desc
       limit 12
    )
    select e.cnpj, e.nome, r.nome, e.cnae, concat_ws(', ', e.logradouro, e.numero), e.bairro, e.cidade,
           extensions.st_y(e.local::extensions.geometry), extensions.st_x(e.local::extensions.geometry),
           round(extensions.st_distance(e.local, v_ponto))::integer
      from privado.empresas_receita e
      join ramos using (cnae)
      left join privado.ramos_do_publike r on r.cnae = e.cnae
     where e.situacao = 'ativa' and not e.mei and e.local is not null
       and extensions.st_dwithin(e.local, v_ponto, v_raio * 1000)
     order by extensions.st_distance(e.local, v_ponto), e.nome
     limit least(greatest(coalesce(p_limite, 60), 1), 100);
end
$$;
revoke execute on function public.lugares_da_rota(text, double precision, double precision, numeric, integer) from public, anon;
grant execute on function public.lugares_da_rota(text, double precision, double precision, numeric, integer)
  to authenticated, service_role;

-- 3. Montar a rota: guarda o currículo impresso e cria uma cópia (com o código do QR) para cada lugar --------------

create or replace function public.criar_rota_curriculo(
  p_cbo text, p_funcao text, p_lat double precision, p_lng double precision, p_raio_km numeric,
  p_cnpjs text[], p_curriculo jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_eu uuid := auth.uid();
  v_rota uuid;
  v_ponto extensions.geography;
  v_n integer;
begin
  if v_eu is null then
    raise exception 'Entre para montar a rota.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_cnpjs, 1), 0) not between 1 and 15 then
    raise exception 'Escolha de 1 a 15 lugares.' using errcode = '22023';
  end if;
  if (select count(*) from privado.rotas_curriculo r
       where r.perfil_id = v_eu and r.criada_em > now() - interval '1 day') >= 3
     or (select count(*) from privado.copias_curriculo c
          where c.perfil_id = v_eu and c.criada_em > now() - interval '1 day') + array_length(p_cnpjs, 1) > 45 then
    raise exception 'Você já montou rotas demais hoje. Amanhã dá para montar outra.' using errcode = '54000';
  end if;
  if p_lat is null or p_lng is null or coalesce(length(trim(p_funcao)), 0) < 2 then
    raise exception 'Falta a função ou o ponto de partida.' using errcode = '22023';
  end if;
  v_ponto := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  insert into privado.rotas_curriculo (perfil_id, cbo, funcao, raio_km, lat, lng, curriculo)
  values (v_eu, nullif(p_cbo, ''), left(trim(p_funcao), 90), least(greatest(coalesce(p_raio_km, 2), 0.5), 10),
          p_lat, p_lng, coalesce(p_curriculo, '{}'::jsonb))
  returning id into v_rota;

  insert into privado.copias_curriculo (codigo, rota_id, perfil_id, cnpj, nome_local, endereco, bairro, cidade, distancia_m, ordem)
  select substr(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                          'abcdefghijklmnopqrstuvwxyz0123'), 1, 10),
         v_rota, v_eu, e.cnpj, e.nome, concat_ws(', ', e.logradouro, e.numero), e.bairro, e.cidade,
         round(extensions.st_distance(e.local, v_ponto))::integer,
         row_number() over (order by extensions.st_distance(e.local, v_ponto), e.nome)
    from privado.empresas_receita e
   where e.cnpj = any(p_cnpjs) and e.situacao = 'ativa' and not e.mei and e.local is not null;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Nenhum desses lugares está na base.' using errcode = '22023';
  end if;
  return jsonb_build_object('rota', v_rota, 'copias', v_n);
end
$$;
revoke execute on function public.criar_rota_curriculo(text, text, double precision, double precision, numeric, text[], jsonb)
  from public, anon;
grant execute on function public.criar_rota_curriculo(text, text, double precision, double precision, numeric, text[], jsonb)
  to authenticated, service_role;

-- 4. Uma rota minha (para imprimir e para o checklist) e as minhas rotas ----------------------------------------

create or replace function public.minha_rota_curriculo(p_rota uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', r.id, 'funcao', r.funcao, 'raio_km', r.raio_km, 'criada_em', r.criada_em, 'curriculo', r.curriculo,
           'copias', coalesce((select jsonb_agg(jsonb_build_object(
                         'codigo', c.codigo, 'cnpj', c.cnpj, 'nome', c.nome_local, 'endereco', c.endereco,
                         'bairro', c.bairro, 'cidade', c.cidade, 'distancia_m', c.distancia_m,
                         'entregue_em', c.entregue_em, 'desligada', c.desligada, 'aberturas', c.aberturas,
                         'aberta_em', c.aberta_em) order by c.ordem)
                         from privado.copias_curriculo c where c.rota_id = r.id), '[]'::jsonb))
    from privado.rotas_curriculo r
   where r.id = p_rota and r.perfil_id = auth.uid()
$$;
revoke execute on function public.minha_rota_curriculo(uuid) from public, anon;
grant execute on function public.minha_rota_curriculo(uuid) to authenticated, service_role;

create or replace function public.minhas_rotas_curriculo()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'funcao', r.funcao, 'raio_km', r.raio_km, 'criada_em', r.criada_em,
           'copias', (select count(*) from privado.copias_curriculo c where c.rota_id = r.id),
           'entregues', (select count(*) from privado.copias_curriculo c where c.rota_id = r.id and c.entregue_em is not null),
           'abertas', (select count(*) from privado.copias_curriculo c where c.rota_id = r.id and c.aberturas > 0))
         order by r.criada_em desc), '[]'::jsonb)
    from (select * from privado.rotas_curriculo r where r.perfil_id = auth.uid() order by r.criada_em desc limit 20) r
$$;
revoke execute on function public.minhas_rotas_curriculo() from public, anon;
grant execute on function public.minhas_rotas_curriculo() to authenticated, service_role;

-- 5. O checklist: entreguei / desligar a página da cópia -------------------------------------------------------

create or replace function public.mudar_copia_curriculo(p_codigo text, p_entregue boolean default null, p_desligada boolean default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update privado.copias_curriculo c
     set entregue_em = case when p_entregue is null then c.entregue_em when p_entregue then coalesce(c.entregue_em, now()) end,
         desligada = coalesce(p_desligada, c.desligada)
   where c.codigo = p_codigo and c.perfil_id = auth.uid();
  return found;
end
$$;
revoke execute on function public.mudar_copia_curriculo(text, boolean, boolean) from public, anon;
grant execute on function public.mudar_copia_curriculo(text, boolean, boolean) to authenticated, service_role;

-- 6. O QR code: a página da cópia (aberta, sem conta). Conta a abertura e avisa a pessoa na primeira vez --------

create or replace function public.abrir_copia_curriculo(p_codigo text, p_contar boolean default true)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.copias_curriculo;
  r privado.rotas_curriculo;
begin
  if coalesce(p_codigo, '') !~ '^[a-z0-9]{10}$' then
    return null;
  end if;
  select * into c from privado.copias_curriculo x where x.codigo = p_codigo;
  if not found then
    return null;
  end if;
  if c.desligada then
    return jsonb_build_object('desligada', true);
  end if;
  select * into r from privado.rotas_curriculo x where x.id = c.rota_id;
  -- a própria pessoa conferindo a cópia não conta
  if p_contar and auth.uid() is distinct from c.perfil_id then
    update privado.copias_curriculo x
       set aberturas = x.aberturas + 1, aberta_em = coalesce(x.aberta_em, now()), ultima_abertura = now()
     where x.codigo = p_codigo;
    if c.aberta_em is null then
      insert into public.notificacoes (destinatario_id, tipo, texto, link)
      values (c.perfil_id, 'copia_aberta',
              'Abriram a cópia do seu currículo que você deixou em ' || c.nome_local || '.',
              '/rota-do-curriculo/' || c.rota_id);
    end if;
  end if;
  return jsonb_build_object('desligada', false, 'para', c.nome_local, 'cnpj', c.cnpj, 'curriculo', r.curriculo,
                            'funcao', r.funcao, 'criada_em', r.criada_em);
end
$$;
revoke execute on function public.abrir_copia_curriculo(text, boolean) from public;
grant execute on function public.abrir_copia_curriculo(text, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
