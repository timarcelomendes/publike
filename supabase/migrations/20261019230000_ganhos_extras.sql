-- =====================================================================
-- Ganhos a mais da vaga: comissão, bônus, gorjeta, hora extra...
--
-- Junto do valor, a empresa põe o que a pessoa ganha a mais: um nome ("Bônus")
-- e, se quiser, como funciona ("até R$ 500 por meta batida"). Fica em
-- anuncios.ganhos_extras (jsonb): [{ "nome": "...", "detalhe": "..." }].
-- A forma de cada item é conferida no site (src/lib/vaga-extra.ts); aqui o
-- banco limita o tamanho. O "comissao" de antes continua: o site marca quando
-- um dos ganhos é comissão (o cartão e as vagas antigas leem dali).
--
-- A revisão da IA também lê os ganhos a mais (mudou, revisa de novo).
--
-- Rode ANTES de publicar o código novo. Rode depois de
-- 20261019210000_intencao_talento.sql. Pode rodar de novo.
-- =====================================================================

-- 1. Coluna -------------------------------------------------------------------------

alter table public.anuncios add column if not exists ganhos_extras jsonb not null default '[]'::jsonb;

alter table public.anuncios drop constraint if exists anuncios_ganhos_extras_check;
alter table public.anuncios add constraint anuncios_ganhos_extras_check check (
  jsonb_typeof(ganhos_extras) = 'array' and jsonb_array_length(ganhos_extras) <= 6
  and octet_length(ganhos_extras::text) <= 1500
);

grant insert (ganhos_extras), update (ganhos_extras) on public.anuncios to authenticated;

-- serviço não tem ganhos a mais (como a comissão)
create or replace function public.anuncios_campos_da_vaga()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.beneficios_lista := coalesce(new.beneficios_lista, '{}');
  new.comissao := coalesce(new.comissao, false);
  new.ganhos_extras := coalesce(new.ganhos_extras, '[]'::jsonb);
  if new.tipo <> 'vaga' then
    new.pagamento_ate := null;
    new.comissao := false;
    new.ganhos_extras := '[]'::jsonb;
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


-- 2. A página da vaga traz os ganhos a mais -------------------------------------------

drop function if exists public.obter_anuncio(uuid);
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
  pcd text,
  perguntas jsonb,
  beneficios_extras text[],
  horario_detalhe jsonb,
  minhas_respostas jsonb,
  contato_direto boolean,
  preenchida_em timestamptz,
  prazo_dias smallint,
  ganhos_extras jsonb
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
         a.jornada, a.modelo, a.pcd,
         a.perguntas, a.beneficios_extras, a.horario_detalhe, c.respostas, a.contato_direto,
         a.preenchida_em, a.prazo_dias, a.ganhos_extras
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
   where a.id = p_id
$$;

grant execute on function public.obter_anuncio(uuid) to anon, authenticated;


-- 3. A revisão da IA lê os ganhos a mais --------------------------------------------
-- Vaga sem ganhos a mais fica com a mesma "versão" de antes (o vazio não entra na conta):
-- nenhuma vaga volta para a fila só por causa desta migração.

create or replace function privado.conteudo_revisado(a public.anuncios)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws(chr(31), a.tipo, a.titulo, a.descricao, a.categoria, a.regime, a.pagamento_valor::text,
                       a.pagamento_unidade, a.beneficios, a.horario, a.vagas::text, a.oficio,
                       array_to_string(a.fotos, ','), a.contratante, a.contratante_confidencial::text,
                       nullif(a.ganhos_extras::text, '[]')))
$$;

drop trigger if exists anuncios_revisao_ia on public.anuncios;
create trigger anuncios_revisao_ia
  after insert or update of titulo, descricao, categoria, regime, pagamento_valor, pagamento_unidade,
                            beneficios, horario, vagas, oficio, fotos, contratante, contratante_confidencial,
                            ganhos_extras
  on public.anuncios
  for each row execute function privado.anuncio_para_revisao_ia();

drop function if exists public.servidor_pegar_revisoes_ia(text, integer);
create function public.servidor_pegar_revisoes_ia(p_chave text, p_limite integer default 5)
returns table (
  anuncio_id uuid, versao text, tipo text, titulo text, descricao text, categoria text, regime text,
  pagamento_valor numeric, pagamento_unidade text, beneficios text, horario text, vagas smallint, cidade text,
  bairro text, autor_tipo text, modelo text, oficio text, fotos text[], contratante text,
  contratante_confidencial boolean, ganhos_extras jsonb
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
         a.oficio, a.fotos, a.contratante, a.contratante_confidencial, a.ganhos_extras
    from marcados m
    join public.anuncios a on a.id = m.anuncio_id
    join public.perfis p on p.id = a.autor_id
    cross join public.config_site c;
end
$$;

revoke execute on function public.servidor_pegar_revisoes_ia(text, integer) from public;
grant execute on function public.servidor_pegar_revisoes_ia(text, integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
