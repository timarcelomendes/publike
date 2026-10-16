-- =====================================================================
-- Vaga do jeito da empresa
--
-- 1. Perguntas (requisitos personalizados): a empresa dá o nome e o tipo de
--    resposta (sim ou não, resposta curta, número ou escolher uma opção) e diz
--    se é obrigatória. O candidato responde ao curtir; a resposta fica na
--    curtida e só ele e quem publicou veem (a mesma regra da curtida).
-- 2. Benefícios a mais, além dos prontos (beneficios_extras).
-- 3. Horário montado: escala, dias, turnos e observação (horario_detalhe).
--    O texto de sempre (horario) continua sendo gravado, montado a partir dele.
--
-- A forma de cada item é conferida no site (src/lib/vaga-extra.ts); aqui o
-- banco limita o tamanho e garante as perguntas obrigatórias.
-- Rode ANTES de publicar o código novo. Rode depois de
-- 20261015220000_mais_regimes.sql. Pode rodar de novo.
-- =====================================================================

-- 1. Colunas ----------------------------------------------------------------------

alter table public.anuncios add column if not exists perguntas jsonb not null default '[]'::jsonb;
alter table public.anuncios add column if not exists beneficios_extras text[] not null default '{}';
alter table public.anuncios add column if not exists horario_detalhe jsonb;

alter table public.anuncios drop constraint if exists anuncios_perguntas_check;
alter table public.anuncios add constraint anuncios_perguntas_check check (
  jsonb_typeof(perguntas) = 'array' and jsonb_array_length(perguntas) <= 8 and octet_length(perguntas::text) <= 8000
);
alter table public.anuncios drop constraint if exists anuncios_beneficios_extras_check;
alter table public.anuncios add constraint anuncios_beneficios_extras_check check (
  cardinality(beneficios_extras) <= 10 and char_length(array_to_string(beneficios_extras, '|')) <= 450
);
alter table public.anuncios drop constraint if exists anuncios_horario_detalhe_check;
alter table public.anuncios add constraint anuncios_horario_detalhe_check check (
  horario_detalhe is null or (jsonb_typeof(horario_detalhe) = 'object' and octet_length(horario_detalhe::text) <= 2000)
);

-- o texto montado do horário e dos benefícios a mais pode passar dos 120 de antes
alter table public.anuncios drop constraint if exists anuncios_horario_check;
alter table public.anuncios add constraint anuncios_horario_check check (char_length(horario) <= 260);
alter table public.anuncios drop constraint if exists anuncios_beneficios_check;
alter table public.anuncios add constraint anuncios_beneficios_check check (char_length(beneficios) <= 460);

grant insert (perguntas, beneficios_extras, horario_detalhe), update (perguntas, beneficios_extras, horario_detalhe)
  on public.anuncios to authenticated;

alter table public.curtidas add column if not exists respostas jsonb not null default '{}'::jsonb;
alter table public.curtidas drop constraint if exists curtidas_respostas_check;
alter table public.curtidas add constraint curtidas_respostas_check check (
  jsonb_typeof(respostas) = 'object' and octet_length(respostas::text) <= 6000
);
grant insert (respostas) on public.curtidas to authenticated;

-- 2. Perguntas obrigatórias -----------------------------------------------------------
-- Ao curtir (ou mudar as respostas), as obrigatórias da vaga precisam estar respondidas.

create or replace function privado.conferir_respostas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pergunta jsonb;
begin
  for pergunta in
    select p from public.anuncios a, jsonb_array_elements(a.perguntas) p where a.id = new.anuncio_id
  loop
    if coalesce((pergunta ->> 'obrigatoria')::boolean, false)
       and btrim(coalesce(new.respostas ->> (pergunta ->> 'id'), '')) = '' then
      raise exception 'A empresa fez perguntas para esta vaga. Responda na página da vaga para curtir.'
        using errcode = 'P0001', hint = 'perguntas';
    end if;
  end loop;
  return new;
end
$$;

drop trigger if exists curtidas_respostas on public.curtidas;
create trigger curtidas_respostas
  before insert or update of respostas on public.curtidas
  for each row execute function privado.conferir_respostas();

-- O candidato muda as respostas enquanto a curtida está de pé.
create or replace function public.responder_perguntas(p_anuncio uuid, p_respostas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  update public.curtidas
     set respostas = coalesce(p_respostas, '{}'::jsonb)
   where anuncio_id = p_anuncio
     and perfil_id = (select auth.uid())
     and status in ('pendente', 'match');
  if not found then
    raise exception 'Curta a vaga primeiro.' using errcode = 'P0001';
  end if;
end
$$;

revoke execute on function public.responder_perguntas(uuid, jsonb) from public, anon;
grant execute on function public.responder_perguntas(uuid, jsonb) to authenticated;

-- 3. A página da vaga traz as partes novas (e as minhas respostas) ---------------------

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
  minhas_respostas jsonb
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
         a.perguntas, a.beneficios_extras, a.horario_detalhe, c.respostas
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
   where a.id = p_id
$$;

grant execute on function public.obter_anuncio(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
