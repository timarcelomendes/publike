-- =====================================================================
-- Serviços viram ofertas: quem trabalha diz o que faz, e quem precisa
-- escolhe entre os profissionais perto de casa.
--
-- Antes, "serviço" era um pedido ("preciso de alguém para..."). Agora:
--   * vaga  = tenho um trabalho para você (CLT, diária, bico...)
--   * serviço = estou disponível para trabalhar (pedreiro, diarista...)
--
-- O profissional preenche um cadastro só ("Meus serviços"): marca o que
-- faz, descreve cada serviço, dá o preço (ou "a combinar"), põe fotos de
-- trabalhos e diz onde atende. Cada serviço vira um anúncio do tipo
-- "servico", ligado à mesma pessoa. Assim a busca, o mapa, a curtida (aqui
-- "quero contratar"), o match, a moderação e as denúncias continuam iguais.
--
-- Rode depois de 20261009120000_prioridade_local.sql.
-- =====================================================================


-- 1. Os pedidos antigos saem ----------------------------------------------
-- O site ainda não foi lançado: os anúncios de serviço que existem são de
-- teste e tinham o sentido antigo (pedido). As curtidas deles vão junto.

delete from public.anuncios where tipo = 'servico';


-- 2. Colunas novas ---------------------------------------------------------

alter table public.anuncios
  add column oficio text check (oficio ~ '^[a-z][a-z-]{1,39}$'),
  add column fotos text[] not null default '{}' check (cardinality(fotos) <= 6),
  add column atende text[] not null default '{}' check (cardinality(atende) <= 30);

comment on column public.anuncios.oficio is 'Serviço: o que a pessoa faz (pedreiro, diarista...). Lista em src/lib/constantes.ts.';
comment on column public.anuncios.fotos is 'Serviço: fotos de trabalhos feitos, no Storage (trabalhos/<id-do-autor>/<data>.jpg).';
comment on column public.anuncios.atende is 'Serviço: onde atende. Nome da cidade ou "Goiânia: Sul" (região de Goiânia).';

alter table public.anuncios
  add constraint vitrine_so_em_servico
  check (tipo = 'servico' or (oficio is null and cardinality(fotos) = 0 and cardinality(atende) = 0));

-- Serviço pode ter título curto ("Babá", "Pintor"); vaga continua com 5 letras ou mais.
alter table public.anuncios drop constraint anuncios_titulo_check;
alter table public.anuncios add constraint anuncios_titulo_check
  check (char_length(titulo) between 2 and 90 and (tipo <> 'vaga' or char_length(titulo) >= 5));

-- Preço por m² e por visita (comum em serviço).
alter table public.anuncios drop constraint anuncios_pagamento_unidade_check;
alter table public.anuncios add constraint anuncios_pagamento_unidade_check
  check (pagamento_unidade in ('hora', 'dia', 'semana', 'mes', 'servico', 'm2', 'visita'));


-- 3. Prazo no ar: vaga 30 dias, serviço 90 -------------------------------

create or replace function public.prazo_no_ar(p_tipo text)
returns interval
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when p_tipo = 'servico' then interval '90 days' else interval '30 days' end
$$;

-- Gatilho do anúncio (mesmas regras de antes) + fotos, área de atendimento,
-- limite de 8 serviços por pessoa e o prazo de cada tipo.
create or replace function public.anuncios_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  moderador boolean := public.eh_moderador();
  -- ligado só dentro de funções do próprio banco (denúncias automáticas, IA)
  sistema boolean := coalesce(current_setting('publike.sistema', true), '') = 'on';
  lat double precision;
  lng double precision;
  prazo interval;
  foto text;
begin
  if tg_op = 'UPDATE' then
    new.tipo := old.tipo;
    new.autor_id := old.autor_id;
  end if;
  prazo := public.prazo_no_ar(new.tipo);

  new.titulo := btrim(regexp_replace(new.titulo, '\s+', ' ', 'g'));
  new.bairro := btrim(regexp_replace(new.bairro, '\s+', ' ', 'g'));
  new.descricao := btrim(new.descricao);
  new.beneficios := nullif(btrim(coalesce(new.beneficios, '')), '');
  new.horario := nullif(btrim(coalesce(new.horario, '')), '');

  -- fotos sem repetição, na ordem, e só da pasta de quem publicou
  new.fotos := coalesce(
    (select array_agg(f order by primeira)
       from (select f, min(n) as primeira
               from unnest(coalesce(new.fotos, '{}')) with ordinality as t(f, n)
              where f is not null
              group by f) u),
    '{}');
  foreach foto in array new.fotos loop
    if foto !~ ('^' || new.autor_id::text || '/[0-9]{10,20}\.jpg$') then
      raise exception 'Envie as fotos de novo.' using errcode = 'P0001', hint = 'foto_invalida';
    end if;
  end loop;

  -- onde atende: sem repetição; cidade ou "Goiânia: Região"
  new.atende := coalesce(
    (select array_agg(a order by primeira)
       from (select btrim(a) as a, min(n) as primeira
               from unnest(coalesce(new.atende, '{}')) with ordinality as t(a, n)
              where btrim(coalesce(a, '')) <> ''
              group by btrim(a)) u),
    '{}');
  if exists (select 1 from unnest(new.atende) a
              where a !~ '^(Goiânia: (Centro|Norte|Sul|Leste|Oeste|Noroeste|Sudoeste)|[[:upper:]][[:alpha:] ]{2,40})$') then
    raise exception 'Confira as regiões que você atende.' using errcode = 'P0001', hint = 'atende_invalido';
  end if;

  -- Confere o texto só quando ele muda: um anúncio antigo não trava a
  -- moderação, a IA nem o vencimento automático.
  if (tg_op = 'INSERT' or new.titulo is distinct from old.titulo or new.descricao is distinct from old.descricao
      or new.beneficios is distinct from old.beneficios or new.horario is distinct from old.horario
      or new.bairro is distinct from old.bairro or new.cidade is distinct from old.cidade)
     and (public.tem_contato(new.titulo) or public.tem_contato(new.descricao, true)
          or public.tem_contato(new.beneficios, true) or public.tem_contato(new.horario, true)
          or public.tem_contato(new.bairro) or public.tem_contato(new.cidade)) then
    raise exception 'Tire o telefone, e-mail ou link do texto. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;

  -- Guarda só a região (grade de ~500 m). O endereço exato nunca é salvo.
  new.local := extensions.st_snaptogrid(new.local::extensions.geometry, 0.005)::extensions.geography;
  lat := extensions.st_y(new.local::extensions.geometry);
  lng := extensions.st_x(new.local::extensions.geometry);
  if lat not between -17.5 and -15.9 or lng not between -50.3 and -48.4 then
    raise exception 'Por enquanto o Publike funciona em Goiânia e região. Marque um ponto dentro da região metropolitana.'
      using errcode = 'P0001', hint = 'fora_da_regiao';
  end if;

  if tg_op = 'INSERT' then
    new.status := 'ativo';
    new.nota_moderacao := null;
    new.status_anterior := null;
    new.criado_em := now();
    new.atualizado_em := now();
    new.expira_em := now() + prazo;
    if usuario is not null then
      perform privado.exigir_conta_ativa();
      if not exists (
        select 1 from public.contatos c
         where c.perfil_id = usuario and (c.whatsapp is not null or c.email is not null)
      ) then
        raise exception 'Complete seu perfil com um WhatsApp antes de publicar.'
          using errcode = 'P0001', hint = 'perfil_incompleto';
      end if;
      if new.tipo = 'servico' and (
        select count(*) from public.anuncios a
         where a.autor_id = usuario and a.tipo = 'servico' and a.status in ('ativo', 'pausado', 'expirado', 'em_analise')
      ) >= 8 then
        raise exception 'Você já tem 8 serviços. Tire algum para pôr outro.'
          using errcode = 'P0001', hint = 'limite_servicos';
      end if;
      perform privado.conferir_ativos(new.id);
      perform privado.conferir_limite('anuncio', 10, 'Você chegou ao limite de 10 publicações por dia. Tente de novo amanhã.');
    end if;
  else
    new.id := old.id;
    new.criado_em := old.criado_em;
    new.atualizado_em := now();
    -- a moderação muda a situação do anúncio só pelos botões (moderar_anuncio)
    if usuario is not null and moderador and not sistema and usuario <> old.autor_id
       and new.status is distinct from old.status then
      raise exception 'Mude a situação do anúncio pelos botões da moderação.' using errcode = 'P0001';
    end if;
    -- regras de quem publicou (valem também para o moderador no próprio anúncio)
    if usuario is not null and not sistema and (not moderador or usuario = old.autor_id) then
      perform privado.exigir_conta_ativa();
      if old.status in ('em_analise', 'removido') then
        raise exception 'Este anúncio está com a moderação e não pode ser alterado agora.'
          using errcode = 'P0001', hint = 'com_moderacao';
      end if;
      if new.status is distinct from old.status and new.status not in ('ativo', 'pausado', 'encerrado') then
        raise exception 'Mudança de status não permitida.' using errcode = '42501';
      end if;
      new.nota_moderacao := old.nota_moderacao;
      -- cada mudança no texto passa de novo pela IA: um limite por dia evita abuso
      if privado.conteudo_revisado(new) <> privado.conteudo_revisado(old) then
        perform privado.conferir_limite('edicao', 40, 'Você editou anúncios muitas vezes hoje. Tente de novo amanhã.');
      end if;
      -- voltar ao ar (de encerrado ou expirado) conta no limite de 20 no ar
      if new.status in ('ativo', 'pausado') and old.status not in ('ativo', 'pausado') then
        perform privado.conferir_ativos(new.id);
      end if;
    end if;
    -- guarda a situação de antes da moderação: ao liberar, o anúncio volta para ela
    if new.status in ('em_analise', 'removido') then
      new.status_anterior := case when old.status in ('em_analise', 'removido') then old.status_anterior else old.status end;
    else
      new.status_anterior := null;
    end if;
    -- voltar ao ar renova o prazo
    if new.status = 'ativo' and old.status is distinct from 'ativo' then
      new.expira_em := now() + prazo;
    end if;
  end if;
  return new;
end
$$;

create or replace function public.renovar_anuncio(p_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  nova_data timestamptz;
begin
  perform privado.exigir_conta_ativa();
  update public.anuncios
     set status = 'ativo', expira_em = now() + public.prazo_no_ar(tipo)
   where id = p_id
     and autor_id = (select auth.uid())
     and status in ('ativo', 'pausado', 'encerrado', 'expirado')
  returning expira_em into nova_data;
  if nova_data is null then
    raise exception 'Não foi possível renovar este anúncio.' using errcode = 'P0001';
  end if;
  return nova_data;
end
$$;


-- 4. IA e registro da equipe olham as colunas novas ------------------------

create or replace function privado.conteudo_revisado(a public.anuncios)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws(chr(31), a.tipo, a.titulo, a.descricao, a.categoria, a.regime, a.pagamento_valor::text,
                       a.pagamento_unidade, a.beneficios, a.horario, a.vagas::text, a.oficio,
                       array_to_string(a.fotos, ',')))
$$;

drop trigger anuncios_revisao_ia on public.anuncios;
create trigger anuncios_revisao_ia
  after insert or update of titulo, descricao, categoria, regime, pagamento_valor, pagamento_unidade,
                            beneficios, horario, vagas, oficio, fotos on public.anuncios
  for each row execute function privado.anuncio_para_revisao_ia();

drop trigger anuncios_editado_pela_equipe on public.anuncios;
create trigger anuncios_editado_pela_equipe
  after update of titulo, descricao, categoria, regime, pagamento_valor, pagamento_unidade,
                  beneficios, horario, vagas, cidade, bairro, local, oficio, fotos, atende on public.anuncios
  for each row execute function privado.anuncio_editado_pela_equipe();

-- O servidor manda as fotos para a IA junto com o texto.
drop function public.servidor_pegar_revisoes_ia(text, integer);
create function public.servidor_pegar_revisoes_ia(p_chave text, p_limite integer default 5)
returns table (
  anuncio_id uuid,
  versao text,
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
  autor_tipo text,
  modelo text,
  oficio text,
  fotos text[]
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_servidor(p_chave);
  -- revisões que travaram três vezes: ficam registradas como erro (e aparecem para a moderação)
  with esgotadas as (
    delete from privado.fila_ia f
     where f.status = 'revisando' and f.tentar_depois <= now() and f.tentativas >= 3
    returning f.anuncio_id
  )
  insert into public.moderacao_ia (anuncio_id, decisao, explicacao)
  select e.anuncio_id, 'erro', 'A revisão não terminou depois de três tentativas.' from esgotadas e;

  return query
  with escolhidos as (
    select f.anuncio_id from privado.fila_ia f
     where f.tentar_depois <= now() and (f.status = 'pendente' or f.tentativas < 3)
     order by f.criado_em
     limit least(greatest(coalesce(p_limite, 5), 1), 20)
     for update skip locked
  ), marcados as (
    update privado.fila_ia f
       set status = 'revisando', tentativas = f.tentativas + 1, tentar_depois = now() + interval '5 minutes'
      from escolhidos e
     where f.anuncio_id = e.anuncio_id
    returning f.anuncio_id
  )
  select a.id, privado.conteudo_revisado(a), a.tipo, a.titulo, a.descricao, a.categoria, a.regime, a.pagamento_valor,
         a.pagamento_unidade, a.beneficios, a.horario, a.vagas, a.cidade, a.bairro, p.tipo, c.ia_modelo,
         a.oficio, a.fotos
    from marcados m
    join public.anuncios a on a.id = m.anuncio_id
    join public.perfis p on p.id = a.autor_id
    cross join public.config_site c;
end
$$;

revoke execute on function public.servidor_pegar_revisoes_ia(text, integer) from public;
grant execute on function public.servidor_pegar_revisoes_ia(text, integer) to anon, authenticated, service_role;


-- 5. Busca: serviço que atende a sua região também vem primeiro -------------

drop function if exists public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[]
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
  p_regiao text default null
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
  foto text
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
           -- "Goiânia: Sul": como o profissional marca a região que atende
           case when btrim(coalesce(p_cidade, '')) = 'Goiânia' and nullif(btrim(coalesce(p_regiao, '')), '') is not null
                then 'Goiânia: ' || btrim(p_regiao) end as area
  ),
  achados as (
    select a.id, a.tipo, a.titulo, a.categoria, a.regime,
           a.pagamento_valor, a.pagamento_unidade, a.beneficios,
           a.cidade, a.bairro,
           round(st_y(a.local::geometry)::numeric, 5)::double precision as lat,
           round(st_x(a.local::geometry)::numeric, 5)::double precision as lng,
           st_distance(a.local, ref.ponto) as distancia_m,
           a.criado_em, p.id as autor_id, p.nome as autor_nome, p.tipo as autor_tipo,
           p.verificado as autor_verificado,
           c.status as minha_curtida,
           case
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
       -- dentro da distância, ou um profissional que atende onde a pessoa mora
       and (st_dwithin(a.local, ref.ponto, least(greatest(p_raio_km, 1), 100) * 1000)
            or (a.tipo = 'servico' and h.cidade is not null
                and (h.cidade = any (a.atende) or h.area = any (a.atende))))
       and (p_tipo is null or a.tipo = p_tipo)
       and (p_categoria is null or a.categoria = p_categoria)
       and (p_regime is null or a.regime = p_regime)
       and (q.texto is null
            or a.busca @@ q.tsq
            or public.sem_acento(a.titulo) ilike '%' || public.sem_acento(q.texto) || '%')
  )
  select x.id, x.tipo, x.titulo, x.categoria, x.regime,
         x.pagamento_valor, x.pagamento_unidade, x.beneficios,
         x.cidade, x.bairro, x.lat, x.lng,
         round((x.distancia_m / 1000)::numeric, 1)::double precision,
         x.criado_em, x.autor_id, x.autor_nome, x.autor_tipo, x.autor_verificado,
         x.minha_curtida, x.prioridade, x.oficio, x.foto
    from achados x
   order by
     x.prioridade,
     case when p_ordem = 'recentes' then x.criado_em end desc nulls last,
     x.distancia_m,
     x.criado_em desc
   limit least(greatest(p_limite, 1), 200)
$$;

revoke all on function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text
) from public;
grant execute on function public.buscar_anuncios(
  double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text
) to anon, authenticated;


-- 6. Página do anúncio: fotos, ofício e onde atende -----------------------

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
  atende text[]
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
         a.oficio, a.fotos, a.atende
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
   where a.id = p_id
$$;

grant execute on function public.obter_anuncio(uuid) to anon, authenticated;


-- 7. Cadastro "Meus serviços": salva todos de uma vez ---------------------
-- p_servicos: [{id?, oficio?, categoria, titulo, descricao, pagamento_valor?,
--               pagamento_unidade?, fotos: []}]
-- O que é igual para todos (onde fica, onde atende, quando atende) vai à parte.
-- Salvar de novo é dizer "continuo disponível": renova os 90 dias.
-- Serviço que sai da lista fica encerrado (curtidas e matches continuam no painel).

create or replace function public.salvar_meus_servicos(
  p_servicos jsonb,
  p_cidade text,
  p_bairro text,
  p_lat double precision,
  p_lng double precision,
  p_atende text[],
  p_horario text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  item jsonb;
  v_id uuid;
  achado uuid;
  mantidos uuid[] := '{}';
  ponto extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  v_valor numeric;
  v_unidade text;
  v_fotos text[];
begin
  if usuario is null then
    raise exception 'Entre na sua conta para salvar seus serviços.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if jsonb_typeof(p_servicos) is distinct from 'array' or jsonb_array_length(p_servicos) = 0 then
    raise exception 'Escolha pelo menos um serviço.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_servicos) > 8 then
    raise exception 'Escolha no máximo 8 serviços.' using errcode = 'P0001', hint = 'limite_servicos';
  end if;

  for item in select value from jsonb_array_elements(p_servicos) loop
    v_id := case when coalesce(item ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 then (item ->> 'id')::uuid end;
    v_valor := case when jsonb_typeof(item -> 'pagamento_valor') = 'number' then (item ->> 'pagamento_valor')::numeric end;
    v_unidade := case when v_valor is null then null else nullif(item ->> 'pagamento_unidade', '') end;
    if v_unidade is null then
      v_valor := null;
    end if;
    v_fotos := coalesce(
      (select array_agg(f) from jsonb_array_elements_text(
         case when jsonb_typeof(item -> 'fotos') = 'array' then item -> 'fotos' else '[]'::jsonb end) f),
      '{}');
    achado := null;

    if v_id is not null then
      update public.anuncios a
         set titulo = item ->> 'titulo',
             descricao = item ->> 'descricao',
             categoria = item ->> 'categoria',
             oficio = nullif(item ->> 'oficio', ''),
             pagamento_valor = v_valor,
             pagamento_unidade = v_unidade,
             fotos = v_fotos,
             cidade = p_cidade,
             bairro = p_bairro,
             local = ponto,
             atende = coalesce(p_atende, '{}'),
             horario = p_horario,
             -- salvar renova: vencido volta ao ar; no ar ganha mais 90 dias
             status = case when a.status = 'expirado' then 'ativo' else a.status end,
             expira_em = case when a.status = 'ativo' then now() + public.prazo_no_ar('servico') else a.expira_em end
       where a.id = v_id and a.autor_id = usuario and a.tipo = 'servico'
         and a.status in ('ativo', 'pausado', 'expirado')
      returning a.id into achado;
      if achado is null then
        raise exception 'Um dos serviços não pode ser alterado agora. Recarregue a página.' using errcode = 'P0001';
      end if;
    else
      insert into public.anuncios
        (tipo, titulo, descricao, categoria, oficio, pagamento_valor, pagamento_unidade, fotos,
         cidade, bairro, local, atende, horario)
      values
        ('servico', item ->> 'titulo', item ->> 'descricao', item ->> 'categoria', nullif(item ->> 'oficio', ''),
         v_valor, v_unidade, v_fotos, p_cidade, p_bairro, ponto, coalesce(p_atende, '{}'), p_horario)
      returning id into achado;
    end if;
    mantidos := mantidos || achado;
  end loop;

  update public.anuncios a
     set status = 'encerrado'
   where a.autor_id = usuario and a.tipo = 'servico'
     and a.status in ('ativo', 'pausado', 'expirado')
     and a.id <> all (mantidos);

  return cardinality(mantidos);
end
$$;

revoke execute on function public.salvar_meus_servicos(jsonb, text, text, double precision, double precision, text[], text)
  from public, anon;
grant execute on function public.salvar_meus_servicos(jsonb, text, text, double precision, double precision, text[], text)
  to authenticated;

grant insert (oficio, fotos, atende), update (oficio, fotos, atende) on public.anuncios to authenticated;

-- O que aparece no cadastro: os serviços de quem está logado (menos os encerrados).
create or replace function public.meus_servicos()
returns table (
  id uuid,
  oficio text,
  categoria text,
  titulo text,
  descricao text,
  pagamento_valor numeric,
  pagamento_unidade text,
  fotos text[],
  atende text[],
  horario text,
  cidade text,
  bairro text,
  lat double precision,
  lng double precision,
  status text,
  expira_em timestamptz
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select a.id, a.oficio, a.categoria, a.titulo, a.descricao, a.pagamento_valor, a.pagamento_unidade,
         a.fotos, a.atende, a.horario, a.cidade, a.bairro,
         round(st_y(a.local::geometry)::numeric, 5)::double precision,
         round(st_x(a.local::geometry)::numeric, 5)::double precision,
         case when a.status = 'ativo' and a.expira_em <= now() then 'expirado' else a.status end,
         a.expira_em
    from public.anuncios a
   where a.autor_id = (select auth.uid()) and a.tipo = 'servico' and a.status <> 'encerrado'
   order by a.criado_em
$$;

revoke execute on function public.meus_servicos() from public, anon;
grant execute on function public.meus_servicos() to authenticated;


-- 8. Avisos: no serviço, quem curte quer contratar -----------------------

create or replace function public.notificar_curtida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dono uuid;
  v_titulo text;
  v_tipo text;
  quem text;
begin
  select a.autor_id, a.titulo, a.tipo into dono, v_titulo, v_tipo from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into quem from public.perfis p where p.id = new.perfil_id;
  -- curtir, descurtir e curtir de novo não enche o sino de avisos
  if not exists (
    select 1 from public.notificacoes n
     where n.destinatario_id = dono and n.anuncio_id = new.anuncio_id and n.ator_id = new.perfil_id
       and n.tipo = 'curtida' and n.criado_em > now() - interval '24 hours'
  ) then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (dono, 'curtida', new.anuncio_id, new.perfil_id,
            case when v_tipo = 'servico'
                 then coalesce(quem, 'Alguém') || ' quer contratar você: “' || v_titulo || '”.'
                 else coalesce(quem, 'Alguém') || ' curtiu “' || v_titulo || '”.'
            end);
  end if;
  return null;
end
$$;

create or replace function public.notificar_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_tipo text;
  quem text;
  dono uuid;
begin
  if new.status = 'match' and old.status is distinct from 'match' then
    select a.titulo, a.tipo, p.nome, p.id into v_titulo, v_tipo, quem, dono
      from public.anuncios a join public.perfis p on p.id = a.autor_id
     where a.id = new.anuncio_id;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (new.perfil_id, 'match', new.anuncio_id, dono,
            case when v_tipo = 'servico'
                 then 'Deu match! ' || coalesce(quem, 'O profissional') || ' aceitou seu pedido em “' || v_titulo
                      || '”. Agora é só conversar.'
                 else 'Deu match! ' || coalesce(quem, 'Quem publicou') || ' curtiu você de volta em “' || v_titulo
                      || '”. Agora é só conversar.'
            end);
  end if;
  return null;
end
$$;

-- Textos dos e-mails que servem para vaga e serviço. Só troca o que ninguém
-- editou no admin.
update public.modelos_email
   set assunto = case when assunto = assunto_padrao then '{{quem}} se interessou por “{{titulo}}”' else assunto end,
       corpo = case when corpo = corpo_padrao then 'Oi, {{nome}}!

{{quem}} se interessou pelo seu anúncio “{{titulo}}” no Publike.

Veja o perfil. Se combinar, aceite: quando dá match, o WhatsApp de vocês dois aparece no painel.' else corpo end,
       botao = case when botao is not distinct from botao_padrao then 'Ver quem se interessou' else botao end,
       assunto_padrao = '{{quem}} se interessou por “{{titulo}}”',
       corpo_padrao = 'Oi, {{nome}}!

{{quem}} se interessou pelo seu anúncio “{{titulo}}” no Publike.

Veja o perfil. Se combinar, aceite: quando dá match, o WhatsApp de vocês dois aparece no painel.',
       botao_padrao = 'Ver quem se interessou',
       descricao = 'Quando alguém curte uma vaga da pessoa ou quer contratar um serviço dela. No máximo um e-mail a cada 30 minutos.'
 where chave = 'curtida';

update public.modelos_email
   set corpo = case when corpo = corpo_padrao then 'Oi, {{nome}}!

{{quem}} aceitou em “{{titulo}}”. Agora vocês podem conversar pelo WhatsApp.

O contato está no seu painel, em Matches.' else corpo end,
       corpo_padrao = 'Oi, {{nome}}!

{{quem}} aceitou em “{{titulo}}”. Agora vocês podem conversar pelo WhatsApp.

O contato está no seu painel, em Matches.',
       descricao = 'Quando quem publicou aceita a pessoa (deu match).'
 where chave = 'match';


-- 9. Fotos dos trabalhos (Storage) ------------------------------------------
-- Pasta por pessoa: trabalhos/<id-do-usuário>/<data>.jpg. Públicas, como as
-- fotos de perfil; conta suspensa não envia nem apaga.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trabalhos', 'trabalhos', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "publike: dono vê as fotos de trabalhos" on storage.objects;
drop policy if exists "publike: dono envia foto de trabalho" on storage.objects;
drop policy if exists "publike: dono apaga foto de trabalho" on storage.objects;

create policy "publike: dono vê as fotos de trabalhos" on storage.objects
  for select to authenticated
  using (bucket_id = 'trabalhos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "publike: dono envia foto de trabalho" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'trabalhos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and not (select public.minha_conta_suspensa()));
create policy "publike: dono apaga foto de trabalho" on storage.objects
  for delete to authenticated
  using (bucket_id = 'trabalhos' and (storage.foldername(name))[1] = (select auth.uid())::text
         and not (select public.minha_conta_suspensa()));


notify pgrst, 'reload schema';
