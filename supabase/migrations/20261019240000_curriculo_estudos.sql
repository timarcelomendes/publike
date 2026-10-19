-- =====================================================================
-- Currículo: mais de um estudo
--
-- "Até onde você estudou" (e o curso) continua sendo o estudo mais alto. Agora dá
-- para pôr outros: um técnico e uma faculdade, duas faculdades, uma pós... Ficam em
-- curriculos.estudos (jsonb): [{ "nivel": "tecnico", "curso": "Enfermagem" }].
-- A forma é conferida no site (src/lib/validacao.ts); aqui o banco limita o tamanho
-- e não deixa contato no nome do curso.
--
-- As funções que mostram o currículo às empresas (e o resumo da aba Talentos) passam
-- a trazer os estudos: mudou o que devolvem, então apaga e cria de novo.
--
-- Rode ANTES de publicar o código novo. Rode depois de
-- 20261019230000_ganhos_extras.sql. Pode rodar de novo.
-- =====================================================================

-- 1. Coluna -------------------------------------------------------------------------

alter table public.curriculos add column if not exists estudos jsonb not null default '[]'::jsonb;

alter table public.curriculos drop constraint if exists curriculos_estudos_check;
alter table public.curriculos add constraint curriculos_estudos_check check (
  jsonb_typeof(estudos) = 'array' and jsonb_array_length(estudos) <= 4 and octet_length(estudos::text) <= 1000
);

grant insert (estudos), update (estudos) on public.curriculos to authenticated;

-- o gatilho do título e das habilidades confere também o nome dos cursos dos estudos
create or replace function public.curriculos_titulo_e_habilidades()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.titulo := nullif(btrim(regexp_replace(coalesce(new.titulo, ''), '\s+', ' ', 'g')), '');
  new.habilidades := coalesce(
    (select array_agg(h order by primeira)
       from (select btrim(regexp_replace(h, '\s+', ' ', 'g')) as h, min(n) as primeira
               from unnest(coalesce(new.habilidades, '{}')) with ordinality as t(h, n)
              where char_length(btrim(coalesce(h, ''))) between 2 and 40
              group by btrim(regexp_replace(h, '\s+', ' ', 'g'))) u),
    '{}');
  new.estudos := coalesce(new.estudos, '[]'::jsonb);
  if public.tem_contato(new.titulo) or public.tem_contato(array_to_string(new.habilidades, ' '), true)
     or public.tem_contato((select string_agg(e ->> 'curso', ' ') from jsonb_array_elements(new.estudos) e), true) then
    raise exception 'Tire o telefone, e-mail ou link do currículo. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  return new;
end
$$;


-- 2. O resumo da aba Talentos e o currículo completo trazem os estudos ----------------

drop function if exists public.talento_resumo(uuid);
create function public.talento_resumo(p_perfil uuid)
returns table (
  perfil_id uuid,
  nome text,
  cidade text,
  bairro text,
  titulo text,
  habilidades text[],
  cursos text[],
  escolaridade text,
  curso text,
  cnh text,
  disponibilidade text[],
  cargos text[],
  meses_experiencia integer,
  atualizado_em timestamptz,
  estudos jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  eu uuid := (select auth.uid());
begin
  return query
  select p.id, privado.nome_curto(p.nome), p.cidade, p.bairro, c.titulo, c.habilidades, c.cursos,
         c.escolaridade, c.curso, c.cnh, c.disponibilidade, privado.cargos_do_curriculo(c.experiencias),
         privado.meses_de_experiencia(c.experiencias), c.atualizado_em, c.estudos
    from public.curriculo_na_vitrine n
    join public.curriculos c on c.perfil_id = n.perfil_id
    join public.perfis p on p.id = n.perfil_id
   where n.perfil_id = p_perfil
     and p.tipo = 'pessoa'
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and (eu is null or not privado.ha_bloqueio(eu, p.id));
end
$$;
revoke execute on function public.talento_resumo(uuid) from public;
grant execute on function public.talento_resumo(uuid) to anon, authenticated;

drop function if exists public.talento_completo(uuid);
create function public.talento_completo(p_perfil uuid)
returns table (
  perfil_id uuid,
  nome text,
  foto text,
  cidade text,
  bairro text,
  sobre text,
  titulo text,
  habilidades text[],
  escolaridade text,
  curso text,
  experiencias jsonb,
  cursos text[],
  cnh text,
  disponibilidade text[],
  atualizado_em timestamptz,
  estudos jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  eu uuid := (select auth.uid());
  v_tipo text;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select p.tipo into v_tipo from public.perfis p where p.id = eu;
  if coalesce(v_tipo, 'pessoa') = 'pessoa' then
    raise exception 'O currículo completo é para empresas, comércios e agências.'
      using errcode = 'P0001', hint = 'so_empresa';
  end if;
  if not exists (
    select 1 from public.curriculo_na_vitrine n join public.perfis p on p.id = n.perfil_id
     where n.perfil_id = p_perfil and p.tipo = 'pessoa' and (p.suspenso_ate is null or p.suspenso_ate < now())
  ) or privado.ha_bloqueio(eu, p_perfil) then
    return;
  end if;
  perform privado.conferir_limite('talento', 200, 'Você abriu muitos currículos hoje. Tente de novo amanhã.');
  return query
  select p.id, privado.nome_curto(p.nome), p.foto, p.cidade, p.bairro, p.sobre, c.titulo, c.habilidades,
         c.escolaridade, c.curso, c.experiencias, c.cursos, c.cnh, c.disponibilidade, c.atualizado_em, c.estudos
    from public.curriculos c
    join public.perfis p on p.id = c.perfil_id
   where c.perfil_id = p_perfil;
end
$$;
revoke execute on function public.talento_completo(uuid) from public, anon;
grant execute on function public.talento_completo(uuid) to authenticated;


-- 3. Os currículos de quem curtiu e os talentos do painel também ---------------------

drop function if exists public.curriculos_dos_interessados(uuid);
create function public.curriculos_dos_interessados(p_anuncio uuid)
returns table (
  perfil_id uuid,
  escolaridade text,
  curso text,
  experiencias jsonb,
  cursos text[],
  cnh text,
  disponibilidade text[],
  arquivo text,
  atualizado_em timestamptz,
  titulo text,
  habilidades text[],
  estudos jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select cv.perfil_id, cv.escolaridade, cv.curso, cv.experiencias, cv.cursos, cv.cnh,
         cv.disponibilidade, cv.arquivo, cv.atualizado_em, cv.titulo, cv.habilidades, cv.estudos
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    join public.curriculos cv on cv.perfil_id = c.perfil_id
   where c.anuncio_id = p_anuncio
     and a.tipo = 'vaga'
     and a.autor_id = (select auth.uid())
     and not (select public.minha_conta_suspensa())
$$;
revoke execute on function public.curriculos_dos_interessados(uuid) from public, anon;
grant execute on function public.curriculos_dos_interessados(uuid) to authenticated;

drop function if exists public.talentos_para_vaga(uuid);
create function public.talentos_para_vaga(p_anuncio uuid)
returns table (
  perfil_id uuid,
  nome text,
  foto text,
  cidade text,
  bairro text,
  escolaridade text,
  curso text,
  experiencias jsonb,
  cursos text[],
  cnh text,
  disponibilidade text[],
  atualizado_em timestamptz,
  convidado boolean,
  titulo text,
  habilidades text[],
  estudos jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_cidade text;
begin
  perform privado.exigir_conta_ativa();
  select a.cidade into v_cidade
    from public.anuncios a
   where a.id = p_anuncio and a.autor_id = eu and a.tipo = 'vaga';
  if not found then
    raise exception 'Vaga não encontrada.' using errcode = 'P0002';
  end if;
  return query
  select p.id,
         -- "Maria S.": o nome inteiro só aparece se a pessoa curtir a vaga
         privado.nome_curto(p.nome),
         p.foto, p.cidade, p.bairro,
         c.escolaridade, c.curso, c.experiencias, c.cursos, c.cnh, c.disponibilidade, c.atualizado_em,
         exists (select 1 from public.convites_vaga cv where cv.anuncio_id = p_anuncio and cv.perfil_id = p.id),
         c.titulo, c.habilidades, c.estudos
    from public.curriculo_visivel v
    join public.curriculos c on c.perfil_id = v.perfil_id
    join public.perfis p on p.id = v.perfil_id
   where p.id <> eu
     and p.tipo = 'pessoa'
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and lower(p.cidade) = lower(v_cidade)
     and not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p.id)
     and not privado.ha_bloqueio(eu, p.id)
   order by c.atualizado_em desc
   limit 200;
end
$$;
revoke execute on function public.talentos_para_vaga(uuid) from public, anon;
grant execute on function public.talentos_para_vaga(uuid) to authenticated;

notify pgrst, 'reload schema';
