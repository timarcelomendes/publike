-- =====================================================================
-- Currículo para vagas (CLT, estágio e o que mais pedir)
--
-- A pessoa preenche o currículo no próprio site: escolaridade, cursos,
-- experiências, CNH e disponibilidade. Pode anexar um PDF, se tiver.
--
-- Ninguém vê o currículo de ninguém, a não ser quem anunciou uma vaga que
-- a pessoa curtiu: é o mesmo que entregar o currículo na vaga. O PDF fica
-- num lugar privado do Storage e só abre com link temporário.
--
-- A vaga pode marcar "pede currículo": quem curte é convidado a preencher.
--
-- Rode depois de 20261009180000_avaliacoes.sql.
-- =====================================================================


-- 1. Tabela ------------------------------------------------------------------

create table public.curriculos (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  escolaridade text check (escolaridade in (
    'fundamental_incompleto', 'fundamental', 'medio_incompleto', 'medio', 'tecnico',
    'superior_incompleto', 'superior', 'pos')),
  curso text check (char_length(curso) between 2 and 80),
  -- [{cargo, onde, inicio: "2023-03", fim: "2024-08" ou null (atual), descricao}]
  experiencias jsonb not null default '[]'::jsonb
    check (jsonb_typeof(experiencias) = 'array' and jsonb_array_length(experiencias) <= 10),
  cursos text[] not null default '{}' check (cardinality(cursos) <= 12),
  cnh text check (cnh in ('A', 'B', 'AB', 'C', 'D', 'E')),
  disponibilidade text[] not null default '{}'
    check (disponibilidade <@ array['manha', 'tarde', 'noite', 'fim_de_semana', 'escala']),
  -- PDF no Storage (curriculos/<id>/<data>.pdf), privado
  arquivo text check (arquivo ~ '^[0-9a-f-]{36}/[0-9]{10,20}\.pdf$'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.curriculos is
  'Currículo da pessoa. Só ela e quem anunciou uma vaga que ela curtiu conseguem ver (curriculo_de, curriculos_dos_interessados).';

alter table public.anuncios add column pede_curriculo boolean not null default false;
alter table public.anuncios add constraint curriculo_so_em_vaga check (tipo = 'vaga' or not pede_curriculo);
grant insert (pede_curriculo), update (pede_curriculo) on public.anuncios to authenticated;


-- 2. Regras ------------------------------------------------------------------

-- Texto sem telefone, e-mail ou link (o contato aparece no match) e o PDF na
-- pasta da própria pessoa.
create or replace function public.curriculos_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  e jsonb;
  junto text := '';
begin
  if new.perfil_id = (select auth.uid()) and coalesce(current_setting('publike.sistema', true), '') <> 'on' then
    perform privado.exigir_conta_ativa();
  end if;
  new.curso := nullif(btrim(regexp_replace(coalesce(new.curso, ''), '\s+', ' ', 'g')), '');
  new.cursos := coalesce(
    (select array_agg(c order by primeira)
       from (select btrim(c) as c, min(n) as primeira
               from unnest(coalesce(new.cursos, '{}')) with ordinality as t(c, n)
              where char_length(btrim(coalesce(c, ''))) between 2 and 80
              group by btrim(c)) u),
    '{}');
  new.disponibilidade := coalesce((select array_agg(distinct d) from unnest(new.disponibilidade) d), '{}');
  if new.arquivo is not null and split_part(new.arquivo, '/', 1) <> new.perfil_id::text then
    raise exception 'Envie o PDF de novo.' using errcode = 'P0001', hint = 'arquivo_invalido';
  end if;

  for e in select value from jsonb_array_elements(new.experiencias) loop
    if jsonb_typeof(e) <> 'object'
       or char_length(btrim(coalesce(e ->> 'cargo', ''))) not between 2 and 80
       or char_length(btrim(coalesce(e ->> 'onde', ''))) > 80
       or char_length(coalesce(e ->> 'descricao', '')) > 300
       or coalesce(e ->> 'inicio', '') !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
       or (e ->> 'fim' is not null and e ->> 'fim' !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$') then
      raise exception 'Confira as experiências.' using errcode = 'P0001', hint = 'experiencia_invalida';
    end if;
    junto := junto || ' ' || coalesce(e ->> 'cargo', '') || ' ' || coalesce(e ->> 'onde', '') || ' ' || coalesce(e ->> 'descricao', '');
  end loop;

  if public.tem_contato(junto, true) or public.tem_contato(new.curso)
     or public.tem_contato(array_to_string(new.cursos, ' '), true) then
    raise exception 'Tire o telefone, e-mail ou link do currículo. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;

  new.atualizado_em := now();
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
    new.perfil_id := old.perfil_id;
  else
    new.criado_em := now();
  end if;
  return new;
end
$$;

create trigger curriculos_antes_de_salvar
  before insert or update on public.curriculos
  for each row execute function public.curriculos_antes_de_salvar();

-- Quem pode ver o currículo de uma pessoa: ela mesma e quem anunciou uma vaga
-- que ela curtiu (enquanto a curtida existir). Conta suspensa não vê.
create or replace function public.pode_ver_curriculo(p_perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_perfil = (select auth.uid())
      or (not public.minha_conta_suspensa() and exists (
            select 1 from public.curtidas c
              join public.anuncios a on a.id = c.anuncio_id
             where c.perfil_id = p_perfil and a.tipo = 'vaga' and a.autor_id = (select auth.uid())))
$$;

alter table public.curriculos enable row level security;
create policy "cada um vê o próprio currículo" on public.curriculos
  for select to authenticated using (perfil_id = (select auth.uid()));
create policy "cada um cria o próprio currículo" on public.curriculos
  for insert to authenticated with check (perfil_id = (select auth.uid()));
create policy "cada um edita o próprio currículo" on public.curriculos
  for update to authenticated
  using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()));
create policy "cada um apaga o próprio currículo" on public.curriculos
  for delete to authenticated using (perfil_id = (select auth.uid()));

revoke all on public.curriculos from anon, authenticated;
grant select, delete on public.curriculos to authenticated;
grant insert (perfil_id, escolaridade, curso, experiencias, cursos, cnh, disponibilidade, arquivo)
  on public.curriculos to authenticated;
grant update (escolaridade, curso, experiencias, cursos, cnh, disponibilidade, arquivo)
  on public.curriculos to authenticated;


-- 3. Para quem anunciou a vaga -----------------------------------------------

-- Os currículos de quem curtiu uma vaga minha.
create or replace function public.curriculos_dos_interessados(p_anuncio uuid)
returns table (
  perfil_id uuid,
  escolaridade text,
  curso text,
  experiencias jsonb,
  cursos text[],
  cnh text,
  disponibilidade text[],
  arquivo text,
  atualizado_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select cv.perfil_id, cv.escolaridade, cv.curso, cv.experiencias, cv.cursos, cv.cnh,
         cv.disponibilidade, cv.arquivo, cv.atualizado_em
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    join public.curriculos cv on cv.perfil_id = c.perfil_id
   where c.anuncio_id = p_anuncio
     and a.tipo = 'vaga'
     and a.autor_id = (select auth.uid())
     and not (select public.minha_conta_suspensa())
$$;


-- 4. Página da vaga: "pede currículo" ---------------------------------------

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
  pede_curriculo boolean
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
         a.oficio, a.fotos, a.atende, a.pede_curriculo
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
   where a.id = p_id
$$;

grant execute on function public.obter_anuncio(uuid) to anon, authenticated;


-- 5. PDF no Storage (privado) ----------------------------------------------
-- Pasta por pessoa: curriculos/<id-do-usuário>/<data>.pdf. Quem anunciou uma
-- vaga que a pessoa curtiu consegue gerar um link temporário para abrir.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('curriculos', 'curriculos', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "publike: currículo para o dono e para quem anunciou" on storage.objects;
drop policy if exists "publike: dono envia currículo" on storage.objects;
drop policy if exists "publike: dono apaga currículo" on storage.objects;

create policy "publike: currículo para o dono e para quem anunciou" on storage.objects
  for select to authenticated
  using (bucket_id = 'curriculos'
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.pode_ver_curriculo(((storage.foldername(name))[1])::uuid));
create policy "publike: dono envia currículo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'curriculos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and not (select public.minha_conta_suspensa()));
create policy "publike: dono apaga currículo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'curriculos' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- 6. Permissões --------------------------------------------------------------

revoke execute on function public.curriculos_dos_interessados(uuid), public.pode_ver_curriculo(uuid)
  from public, anon;
grant execute on function public.curriculos_dos_interessados(uuid), public.pode_ver_curriculo(uuid)
  to authenticated;

notify pgrst, 'reload schema';
