-- =====================================================================
-- Vaga completa
--
-- O cadastro de vagas ganha:
--   * Faixa salarial ("de R$ 1.800 a R$ 2.200") e "mais comissão".
--   * Benefícios marcáveis (vale-transporte, vale-refeição, plano de saúde…),
--     além do campo livre que já existia.
--   * Requisitos: escolaridade mínima, experiência e CNH.
--   * Jornada (integral, meio período, escalas), modelo (presencial, híbrido,
--     remoto) e vaga para PCD (também ou exclusiva).
-- Tudo opcional e só em vaga (serviço fica sem). A página da vaga e a busca
-- passam a devolver os campos novos.
--
-- Rode depois de 20261014120000_ponto_conhecido.sql.
-- =====================================================================


-- 1. Colunas ------------------------------------------------------------------

alter table public.anuncios
  add column pagamento_ate numeric(12, 2) check (pagamento_ate > 0 and pagamento_ate <= 1000000),
  add column comissao boolean not null default false,
  add column beneficios_lista text[] not null default '{}' check (
    cardinality(beneficios_lista) <= 12
    and beneficios_lista <@ array['vale_transporte', 'vale_refeicao', 'vale_alimentacao', 'refeicao_no_local',
                                  'plano_saude', 'plano_odontologico', 'cesta_basica', 'seguro_vida',
                                  'ajuda_combustivel', 'auxilio_creche', 'gympass', 'day_off']::text[]),
  add column escolaridade_minima text check (escolaridade_minima in (
    'fundamental_incompleto', 'fundamental', 'medio_incompleto', 'medio', 'tecnico',
    'superior_incompleto', 'superior', 'pos')),
  add column experiencia text check (experiencia in ('sem', '6_meses', '1_ano', '2_anos')),
  add column cnh text check (cnh in ('A', 'B', 'AB', 'C', 'D', 'E')),
  add column jornada text check (jornada in (
    'integral', 'meio_periodo', 'escala_6x1', 'escala_12x36', 'noturno', 'fim_de_semana', 'flexivel')),
  add column modelo text check (modelo in ('presencial', 'hibrido', 'remoto')),
  add column pcd text check (pcd in ('tambem', 'exclusiva'));

comment on column public.anuncios.pagamento_ate is 'Vaga: fim da faixa salarial (o começo é pagamento_valor).';
comment on column public.anuncios.comissao is 'Vaga: paga comissão além do valor.';
comment on column public.anuncios.beneficios_lista is 'Vaga: benefícios marcados (o campo beneficios fica para os outros).';
comment on column public.anuncios.experiencia is 'Vaga: sem = aceita sem experiência; null = não informado.';
comment on column public.anuncios.pcd is 'Vaga: tambem = também para pessoas com deficiência; exclusiva = só para PCD.';

-- Serviço não tem esses campos; a faixa precisa de começo e não pode ser menor que ele.
create or replace function public.anuncios_campos_da_vaga()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.beneficios_lista := coalesce(new.beneficios_lista, '{}');
  new.comissao := coalesce(new.comissao, false);
  if new.tipo <> 'vaga' then
    new.pagamento_ate := null;
    new.comissao := false;
    new.beneficios_lista := '{}';
    new.escolaridade_minima := null;
    new.experiencia := null;
    new.cnh := null;
    new.jornada := null;
    new.modelo := null;
    new.pcd := null;
    return new;
  end if;
  -- sem repetidos, na ordem em que vieram
  new.beneficios_lista := array(
    select b from unnest(new.beneficios_lista) with ordinality as t(b, n)
     group by b order by min(n));
  if new.pagamento_valor is null then
    new.pagamento_ate := null;
  elsif new.pagamento_ate is not null and new.pagamento_ate <= new.pagamento_valor then
    -- "de 1.800 a 1.800" vira só 1.800
    if new.pagamento_ate = new.pagamento_valor then
      new.pagamento_ate := null;
    else
      raise exception 'O fim da faixa precisa ser maior que o começo.' using errcode = 'P0001', hint = 'pagamento_ate';
    end if;
  end if;
  return new;
end
$$;

create trigger anuncios_campos_da_vaga
  before insert or update on public.anuncios
  for each row execute function public.anuncios_campos_da_vaga();

grant insert (pagamento_ate, comissao, beneficios_lista, escolaridade_minima, experiencia, cnh, jornada, modelo, pcd),
      update (pagamento_ate, comissao, beneficios_lista, escolaridade_minima, experiencia, cnh, jornada, modelo, pcd)
  on public.anuncios to authenticated;


-- 2. Página do anúncio: os campos novos -----------------------------------------
-- (a mesma função de 20261009280000_enderecos.sql, com os campos no fim)

drop function public.obter_anuncio(uuid);
create function public.obter_anuncio(p_id uuid)
returns table (
  id uuid,
  autor_id uuid,
  tipo text,
  titulo text,
  descricao text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  horario text,
  vagas smallint,
  cidade text,
  bairro text,
  lat double precision,
  lng double precision,
  status text,
  criado_em timestamptz,
  atualizado_em timestamptz,
  expira_em timestamptz,
  autor_nome text,
  autor_tipo text,
  autor_foto text,
  autor_verificado boolean,
  autor_desde timestamptz,
  minha_curtida text,
  minha_mensagem text,
  oficio text,
  fotos text[],
  atende text[],
  pede_curriculo boolean,
  contratante text,
  contratante_confidencial boolean,
  autor_cnpj text,
  cep text,
  endereco text,
  local_exato boolean,
  pagamento_ate numeric,
  comissao boolean,
  beneficios_lista text[],
  escolaridade_minima text,
  experiencia text,
  cnh text,
  jornada text,
  modelo text,
  pcd text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select a.id, a.autor_id, a.tipo, a.titulo, a.descricao, a.categoria, a.regime,
         a.pagamento_valor, a.pagamento_unidade, a.beneficios, a.horario, a.vagas,
         a.cidade, a.bairro,
         round(st_y(a.local::geometry)::numeric, 5)::double precision,
         round(st_x(a.local::geometry)::numeric, 5)::double precision,
         a.status, a.criado_em, a.atualizado_em, a.expira_em,
         p.nome, p.tipo, p.foto, p.verificado, p.criado_em,
         c.status, c.mensagem,
         a.oficio, a.fotos, a.atende, a.pede_curriculo,
         a.contratante, a.contratante_confidencial, p.cnpj,
         a.cep, a.endereco, a.local_exato,
         a.pagamento_ate, a.comissao, a.beneficios_lista, a.escolaridade_minima, a.experiencia, a.cnh,
         a.jornada, a.modelo, a.pcd
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
   where a.id = p_id
$$;

grant execute on function public.obter_anuncio(uuid) to anon, authenticated;


-- 3. Busca: a faixa salarial e a comissão para o cartão --------------------------
-- (a mesma busca de 20261009280000_enderecos.sql, com pagamento_ate e comissao no fim)

drop function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text, boolean
);

create function public.buscar_anuncios(
  p_lat double precision default -16.6806,
  p_lng double precision default -49.2563,
  p_raio_km double precision default 25,
  p_tipo text default null,
  p_categoria text default null,
  p_regime text default null,
  p_texto text default null,
  p_ordem text default 'perto',
  p_limite integer default 60,
  p_cidade text default null,
  p_bairro text default null,
  p_bairros_regiao text[] default null,
  p_regiao text default null,
  -- com o CEP de casa, a ordem é só pela distância (sem "primeiro o bairro")
  p_por_distancia boolean default false
)
returns table (
  id uuid,
  tipo text,
  titulo text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  cidade text,
  bairro text,
  lat double precision,
  lng double precision,
  distancia_km double precision,
  criado_em timestamptz,
  autor_id uuid,
  autor_nome text,
  autor_tipo text,
  autor_verificado boolean,
  minha_curtida text,
  prioridade integer,
  oficio text,
  foto text,
  autor_nota numeric,
  autor_avaliacoes integer,
  pagamento_ate numeric,
  comissao boolean
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with ref as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as ponto
  ),
  termo as (
    select nullif(btrim(coalesce(p_texto, '')), '') as texto
  ),
  consulta as (
    select t.texto,
           case when t.texto is null then null
                else websearch_to_tsquery('portuguese'::regconfig, public.sem_acento(t.texto)) end as tsq
      from termo t
  ),
  casa as (
    select nullif(btrim(coalesce(p_cidade, '')), '') as cidade,
           nullif(public.chave_bairro(coalesce(p_bairro, '')), '') as bairro,
           coalesce(p_bairros_regiao, '{}') as regiao,
           case when btrim(coalesce(p_cidade, '')) = 'Goiânia' and nullif(btrim(coalesce(p_regiao, '')), '') is not null
                then 'Goiânia: ' || btrim(p_regiao) end as area
  ),
  achados as (
    select a.id, a.tipo, a.titulo, a.categoria, a.regime,
           a.pagamento_valor, a.pagamento_unidade, a.beneficios, a.pagamento_ate, a.comissao,
           a.cidade, a.bairro,
           round(st_y(a.local::geometry)::numeric, 5)::double precision as lat,
           round(st_x(a.local::geometry)::numeric, 5)::double precision as lng,
           st_distance(a.local, ref.ponto) as distancia_m,
           a.criado_em, p.id as autor_id, p.nome as autor_nome, p.tipo as autor_tipo,
           p.verificado as autor_verificado,
           c.status as minha_curtida,
           case
             when p_por_distancia then 2
             when h.cidade is null then 3
             when a.cidade = h.cidade and h.bairro is not null and public.chave_bairro(a.bairro) = h.bairro then 0
             when a.cidade = h.cidade and public.chave_bairro(a.bairro) = any (h.regiao) then 1
             when a.tipo = 'servico' and h.area is not null and h.area = any (a.atende) then 1
             when a.cidade = h.cidade then 2
             when a.tipo = 'servico' and h.cidade = any (a.atende) then 2
             else 3
           end as prioridade,
           a.oficio,
           a.fotos[1] as foto
      from public.anuncios a
      cross join ref
      cross join consulta q
      cross join casa h
      join public.perfis p on p.id = a.autor_id
      left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
     where a.status = 'ativo'
       and a.expira_em > now()
       and (p.suspenso_ate is null or p.suspenso_ate <= now())
       and (st_dwithin(a.local, ref.ponto, least(greatest(p_raio_km, 1), 100) * 1000)
            or (a.tipo = 'servico' and h.cidade is not null
                and (h.cidade = any (a.atende) or h.area = any (a.atende))))
       and (p_tipo is null or a.tipo = p_tipo)
       and (p_categoria is null or a.categoria = p_categoria)
       and (p_regime is null or a.regime = p_regime)
       and (q.texto is null
            or a.busca @@ q.tsq
            or public.sem_acento(a.titulo) ilike '%' || public.sem_acento(q.texto) || '%')
  ),
  escolhidos as (
    select * from achados x
     order by
       x.prioridade,
       case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
       x.distancia_m,
       x.criado_em desc
     limit least(greatest(p_limite, 1), 200)
  )
  select x.id, x.tipo, x.titulo, x.categoria, x.regime,
         x.pagamento_valor, x.pagamento_unidade, x.beneficios,
         x.cidade, x.bairro, x.lat, x.lng,
         round((x.distancia_m / 1000)::numeric, 1)::double precision,
         x.criado_em, x.autor_id, x.autor_nome, x.autor_tipo, x.autor_verificado,
         x.minha_curtida, x.prioridade, x.oficio, x.foto,
         n.media, coalesce(n.total, 0), x.pagamento_ate, x.comissao
    from escolhidos x
    left join lateral (
      select * from public.nota_do_profissional(x.autor_id) where x.tipo = 'servico'
    ) n on true
   order by
     x.prioridade,
     case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
     x.distancia_m,
     x.criado_em desc
$$;

revoke all on function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text, boolean
) from public;
grant execute on function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text, boolean
) to anon, authenticated;

notify pgrst, 'reload schema';
