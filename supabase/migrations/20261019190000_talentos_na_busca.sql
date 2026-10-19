-- =====================================================================
-- Talentos na busca: a vitrine de currículos
--
-- Quem procura trabalho pode aparecer na aba Talentos da busca. A aba é aberta
-- para quem visita o site, mas mostra só o resumo: o nome encurtado (Maria S.),
-- o bairro, o que a pessoa faz, as habilidades, os cursos, os estudos e o tempo
-- de experiência (os cargos, sem as empresas). Sem contato, sem foto e fora do
-- Google. O currículo completo e o convite para uma vaga ficam para empresa,
-- comércio e agência que entraram na conta. O contato continua só no match.
--   * Currículo: título ("o que eu faço") e habilidades.
--   * curriculo_na_vitrine: quem escolheu aparecer na aba (precisa estar em
--     Talentos para as empresas, curriculo_visivel: apagar um apaga o outro).
--   * buscar_talentos e talento_resumo (todos) e talento_completo (empresas).
--   * convidar_para_vaga: quem está na aba pode ser convidado de qualquer
--     cidade da região (antes, só da cidade da vaga); vaga preenchida não convida.
--   * curriculos_dos_interessados e talentos_para_vaga (Talentos do painel): o
--     currículo que as empresas veem traz o que a pessoa faz e as habilidades; e o
--     nome encurtado do painel é o mesmo da aba.
--
-- Rode depois de 20261019170000_clientes_agencia.sql. Pode rodar de novo.
-- =====================================================================


-- 1. Currículo: o que a pessoa faz e as habilidades ------------------------------------

alter table public.curriculos
  add column if not exists titulo text check (char_length(titulo) between 2 and 60),
  add column if not exists habilidades text[] not null default '{}' check (cardinality(habilidades) <= 15);
grant insert (titulo, habilidades), update (titulo, habilidades) on public.curriculos to authenticated;

-- Roda depois de curriculos_antes_de_salvar (ordem alfabética dos gatilhos).
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
  if public.tem_contato(new.titulo) or public.tem_contato(array_to_string(new.habilidades, ' '), true) then
    raise exception 'Tire o telefone, e-mail ou link do currículo. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  return new;
end
$$;

drop trigger if exists curriculos_titulo_e_habilidades on public.curriculos;
create trigger curriculos_titulo_e_habilidades
  before insert or update on public.curriculos
  for each row execute function public.curriculos_titulo_e_habilidades();


-- 2. Quem aparece na aba Talentos --------------------------------------------------------

create table if not exists public.curriculo_na_vitrine (
  perfil_id uuid primary key references public.curriculo_visivel (perfil_id) on delete cascade,
  desde timestamptz not null default now()
);
comment on table public.curriculo_na_vitrine is
  'Quem escolheu aparecer na aba Talentos da busca (só o resumo, aberto). Apagar a linha tira a pessoa da aba.';

alter table public.curriculo_na_vitrine enable row level security;
drop policy if exists "cada um vê a própria escolha" on public.curriculo_na_vitrine;
create policy "cada um vê a própria escolha" on public.curriculo_na_vitrine
  for select to authenticated using (perfil_id = (select auth.uid()));
drop policy if exists "cada um aparece" on public.curriculo_na_vitrine;
create policy "cada um aparece" on public.curriculo_na_vitrine
  for insert to authenticated with check (perfil_id = (select auth.uid()));
drop policy if exists "cada um some" on public.curriculo_na_vitrine;
create policy "cada um some" on public.curriculo_na_vitrine
  for delete to authenticated using (perfil_id = (select auth.uid()));
revoke all on public.curriculo_na_vitrine from anon, authenticated;
grant select, delete on public.curriculo_na_vitrine to authenticated;
grant insert (perfil_id) on public.curriculo_na_vitrine to authenticated;


-- 3. O resumo: o mesmo para todos (com ou sem conta) ------------------------------------

-- "Maria Souza" vira "Maria S." e "Maria da Silva", "Maria S." (pula da, de, do...): o
-- nome inteiro só aparece no match.
create or replace function privado.nome_curto(p_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select p[1] || coalesce(
           ' ' || upper(left((select x from unnest(p[2:]) with ordinality as t(x, n)
                               where lower(x) not in ('da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del')
                               order by n limit 1), 1)) || '.',
           '')
    from (select regexp_split_to_array(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), ' ') as p) as nome
$$;

-- Os cargos das experiências (sem as empresas), do mais recente, até três.
create or replace function privado.cargos_do_curriculo(p_experiencias jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(u.cargo order by u.primeira), '{}')
    from (select btrim(e ->> 'cargo') as cargo, min(n) as primeira
            from jsonb_array_elements(coalesce(p_experiencias, '[]'::jsonb)) with ordinality as t(e, n)
           where char_length(btrim(coalesce(e ->> 'cargo', ''))) >= 2
           group by btrim(e ->> 'cargo')
           order by min(n)
           limit 3) u
$$;

-- Quantos meses de experiência, somando os trabalhos (o atual conta até hoje).
create or replace function privado.meses_de_experiencia(p_experiencias jsonb)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(greatest(0,
           (split_part(f.fim, '-', 1)::int * 12 + split_part(f.fim, '-', 2)::int)
           - (split_part(f.inicio, '-', 1)::int * 12 + split_part(f.inicio, '-', 2)::int) + 1)), 0)::int
    from (select e ->> 'inicio' as inicio,
                 case when e ->> 'fim' ~ '^[0-9]{4}-[0-9]{2}$' then e ->> 'fim'
                      else to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM') end as fim
            from jsonb_array_elements(coalesce(p_experiencias, '[]'::jsonb)) e
           where e ->> 'inicio' ~ '^[0-9]{4}-[0-9]{2}$') f
$$;

revoke execute on function privado.nome_curto(text), privado.cargos_do_curriculo(jsonb),
  privado.meses_de_experiencia(jsonb) from public;

-- A aba Talentos: quem está na vitrine, do mesmo bairro primeiro, depois quem mexeu no
-- currículo há menos tempo. Busca no que a pessoa faz, nas habilidades, nos cursos e nos cargos.
create or replace function public.buscar_talentos(
  p_texto text default null,
  p_cidade text default null,
  p_bairro text default null,
  p_limite integer default 24,
  p_deslocamento integer default 0
)
returns table (
  perfil_id uuid,
  nome text,
  cidade text,
  bairro text,
  titulo text,
  habilidades text[],
  cursos text[],
  escolaridade text,
  cnh text,
  disponibilidade text[],
  cargos text[],
  meses_experiencia integer,
  atualizado_em timestamptz,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  eu uuid := (select auth.uid());
  termo text := nullif(public.sem_acento(btrim(coalesce(p_texto, ''))), '');
begin
  return query
  select p.id, privado.nome_curto(p.nome), p.cidade, p.bairro, c.titulo, c.habilidades, c.cursos,
         c.escolaridade, c.cnh, c.disponibilidade, privado.cargos_do_curriculo(c.experiencias),
         privado.meses_de_experiencia(c.experiencias), c.atualizado_em, count(*) over ()
    from public.curriculo_na_vitrine n
    join public.curriculos c on c.perfil_id = n.perfil_id
    join public.perfis p on p.id = n.perfil_id
   where p.tipo = 'pessoa'
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and (eu is null or not privado.ha_bloqueio(eu, p.id))
     and (p_cidade is null or lower(p.cidade) = lower(p_cidade))
     and (termo is null or public.sem_acento(concat_ws(' ', c.titulo, array_to_string(c.habilidades, ' '),
            array_to_string(c.cursos, ' '), c.curso,
            (select string_agg(e ->> 'cargo', ' ') from jsonb_array_elements(c.experiencias) e)))
          ilike '%' || termo || '%')
   order by (p_bairro is not null and lower(coalesce(p.bairro, '')) = lower(p_bairro)) desc, c.atualizado_em desc
   limit least(greatest(coalesce(p_limite, 24), 1), 48)
  offset least(greatest(coalesce(p_deslocamento, 0), 0), 480);
end
$$;
revoke execute on function public.buscar_talentos(text, text, text, integer, integer) from public;
grant execute on function public.buscar_talentos(text, text, text, integer, integer) to anon, authenticated;

-- O resumo de uma pessoa da aba (a página dela). Vazio se ela saiu da aba. Sem a
-- apresentação do perfil: ela fica no perfil público, com o nome inteiro (e o currículo
-- completo, para as empresas, traz a apresentação).
create or replace function public.talento_resumo(p_perfil uuid)
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
  atualizado_em timestamptz
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
         privado.meses_de_experiencia(c.experiencias), c.atualizado_em
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


-- 4. O currículo completo: só empresa, comércio e agência que entraram ------------------

-- Cada abertura conta (até 200 por dia): ninguém copia a aba inteira.
alter table privado.limites_uso drop constraint if exists limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check check (acao = any (array[
  'anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao',
  'mensagem', 'seguir', 'recomendacao', 'etapa', 'contratacao', 'ia_resumo', 'convite', 'talento']));

create or replace function public.talento_completo(p_perfil uuid)
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
  atualizado_em timestamptz
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
         c.escolaridade, c.curso, c.experiencias, c.cursos, c.cnh, c.disponibilidade, c.atualizado_em
    from public.curriculos c
    join public.perfis p on p.id = c.perfil_id
   where c.perfil_id = p_perfil;
end
$$;
revoke execute on function public.talento_completo(uuid) from public, anon;
grant execute on function public.talento_completo(uuid) to authenticated;


-- 5. Convite: quem está na aba pode ser convidado de qualquer cidade da região -----------
-- (a mesma função de 20261017120000_talentos_e_resumo.sql, com a vitrine; e vaga
-- preenchida não recebe convite, porque ninguém mais consegue curtir)

create or replace function public.convidar_para_vaga(p_anuncio uuid, p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_titulo text;
  v_cidade text;
  v_preenchida timestamptz;
  quem text;
begin
  perform privado.exigir_conta_ativa();
  select a.titulo, a.cidade, a.preenchida_em into v_titulo, v_cidade, v_preenchida
    from public.anuncios a
   where a.id = p_anuncio and a.autor_id = eu and a.tipo = 'vaga'
     and a.status = 'ativo' and a.expira_em > now();
  if not found then
    raise exception 'Só dá para convidar para uma vaga sua que esteja no ar.' using errcode = 'P0001';
  end if;
  if v_preenchida is not null then
    raise exception 'Esta vaga já foi preenchida: não dá para convidar.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.curriculo_visivel v join public.perfis p on p.id = v.perfil_id
     where v.perfil_id = p_perfil and p.tipo = 'pessoa'
       and (lower(p.cidade) = lower(v_cidade)
            or exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = p_perfil))
       and (p.suspenso_ate is null or p.suspenso_ate < now())
  ) or privado.ha_bloqueio(eu, p_perfil) then
    raise exception 'Essa pessoa não está mais em Talentos.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p_perfil) then
    raise exception 'Essa pessoa já curtiu a vaga: ela está na sua caixa de entrada.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.convites_vaga cv where cv.anuncio_id = p_anuncio and cv.perfil_id = p_perfil) then
    raise exception 'Você já convidou essa pessoa para esta vaga.' using errcode = 'P0001';
  end if;
  perform privado.conferir_limite('convite', 40, 'Você já mandou 40 convites hoje. Tente de novo amanhã.');
  insert into public.convites_vaga (anuncio_id, perfil_id) values (p_anuncio, p_perfil);
  select p.nome into quem from public.perfis p where p.id = eu;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'convite', p_anuncio, eu,
          left(coalesce(quem, 'Uma empresa') || ' viu seu currículo e convidou você para a vaga “' || v_titulo
               || '”. Veja os detalhes e, se tiver interesse, curta a vaga.', 300));
end
$$;
revoke execute on function public.convidar_para_vaga(uuid, uuid) from public, anon;
grant execute on function public.convidar_para_vaga(uuid, uuid) to authenticated;


-- 6. O currículo que as empresas veem: com o que a pessoa faz e as habilidades ---------

-- Os currículos de quem curtiu uma vaga minha (a função de 20261009200000_curriculos.sql,
-- com o título e as habilidades). Mudou o que a função devolve: apaga e cria de novo.
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
  habilidades text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select cv.perfil_id, cv.escolaridade, cv.curso, cv.experiencias, cv.cursos, cv.cnh,
         cv.disponibilidade, cv.arquivo, cv.atualizado_em, cv.titulo, cv.habilidades
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

-- Talentos do painel (a função de 20261017120000_talentos_e_resumo.sql): o título, as
-- habilidades e o mesmo nome encurtado da aba.
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
  habilidades text[]
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
         c.titulo, c.habilidades
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
