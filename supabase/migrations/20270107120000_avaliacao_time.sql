-- Avaliação e decisão em time (claude/plano-recursos-concorrentes.md, parte 4). Pode rodar de novo.
-- 1) A Equipe (antes só da agência) abre para empresa e comércio: o dono convida o gerente ou o sócio.
-- 2) A ficha de avaliação da vaga: até 8 competências. Cada pessoa da equipe dá de 1 a 5 em cada uma, a
--    recomendação (seguir, talvez, não seguir) e um comentário; o gestor avalia pelo link dos finalistas, com o
--    nome. Cada um só vê as notas dos outros depois de dar a sua (para ninguém ir na onda de quem avaliou antes).

-- 1. A equipe para todos -------------------------------------------------------------------------------
create or replace function privado.exigir_quem_administra()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conta uuid := public.conta_atual();
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if public.papel_na_conta() not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta cuida da equipe.' using errcode = '42501', hint = 'papel';
  end if;
  if not exists (select 1 from public.perfis p where p.id = v_conta and p.tipo in ('agencia', 'empresa', 'comercio')) then
    raise exception 'A equipe é para empresa, comércio e agência.' using errcode = 'P0001', hint = 'tipo';
  end if;
  return v_conta;
end
$function$;

-- 2. A ficha e as avaliações ----------------------------------------------------------------------------
create table if not exists public.fichas_avaliacao (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  -- [{"id": "c1", "nome": "Atendimento ao cliente"}], de 1 a 8
  competencias jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.avaliacoes_candidato (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null,
  perfil_id uuid not null,
  -- quem avaliou: a pessoa da equipe (o login) ou o gestor do link (só o nome)
  autor_id uuid references public.perfis (id) on delete set null,
  quem text check (char_length(quem) between 2 and 80),
  chave text not null,
  notas jsonb not null default '{}'::jsonb,
  recomendacao text not null check (recomendacao in ('seguir', 'talvez', 'nao_seguir')),
  comentario text check (char_length(comentario) <= 1000),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (anuncio_id, perfil_id, chave),
  foreign key (anuncio_id, perfil_id) references public.curtidas (anuncio_id, perfil_id) on delete cascade
);
alter table public.fichas_avaliacao enable row level security;
alter table public.avaliacoes_candidato enable row level security;
revoke all on public.fichas_avaliacao, public.avaliacoes_candidato from public, anon, authenticated;

create or replace function privado.minha_vaga_para_avaliar(p_anuncio uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = public.conta_atual() and a.tipo = 'vaga') then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  return p_anuncio;
end
$$;

create or replace function public.ficha_avaliacao(p_anuncio uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select fa.competencias from public.fichas_avaliacao fa
                    where fa.anuncio_id = privado.minha_vaga_para_avaliar(p_anuncio)), '[]'::jsonb)
$$;

create or replace function public.salvar_ficha_avaliacao(p_anuncio uuid, p_competencias text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista jsonb := '[]'::jsonb;
  t text;
  i integer := 0;
begin
  perform privado.minha_vaga_para_avaliar(p_anuncio);
  foreach t in array coalesce(p_competencias, '{}') loop
    t := nullif(btrim(regexp_replace(coalesce(t, ''), '[[:space:]]+', ' ', 'g')), '');
    continue when t is null;
    if char_length(t) < 2 or char_length(t) > 60 then
      raise exception 'Cada competência tem de 2 a 60 letras.' using errcode = '22023';
    end if;
    i := i + 1;
    v_lista := v_lista || jsonb_build_object('id', 'c' || i, 'nome', t);
  end loop;
  if i < 1 or i > 8 then
    raise exception 'A ficha tem de 1 a 8 competências.' using errcode = '22023';
  end if;
  insert into public.fichas_avaliacao (anuncio_id, competencias) values (p_anuncio, v_lista)
  on conflict (anuncio_id) do update set competencias = excluded.competencias, atualizado_em = now();
end
$$;

-- as notas: {"c1": 4, ...}, só das competências da ficha, de 1 a 5
create or replace function privado.notas_validas(p_anuncio uuid, p_notas jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  c jsonb;
  n integer;
begin
  for c in select jsonb_array_elements(coalesce((select fa.competencias from public.fichas_avaliacao fa where fa.anuncio_id = p_anuncio), '[]'::jsonb)) loop
    if p_notas ? (c ->> 'id') then
      n := (p_notas ->> (c ->> 'id'))::integer;
      if n between 1 and 5 then
        v := v || jsonb_build_object(c ->> 'id', n);
      end if;
    end if;
  end loop;
  return v;
end
$$;

create or replace function public.avaliar_candidato(p_anuncio uuid, p_perfil uuid, p_notas jsonb, p_recomendacao text,
                                                    p_comentario text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comentario text := nullif(btrim(coalesce(p_comentario, '')), '');
begin
  perform privado.minha_vaga_para_avaliar(p_anuncio);
  if not exists (select 1 from public.curtidas c where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil) then
    raise exception 'Essa pessoa não se candidatou a esta vaga.' using errcode = 'P0001';
  end if;
  if p_recomendacao not in ('seguir', 'talvez', 'nao_seguir') then
    raise exception 'Escolha a recomendação.' using errcode = '22023';
  end if;
  insert into public.avaliacoes_candidato (anuncio_id, perfil_id, autor_id, chave, notas, recomendacao, comentario)
  values (p_anuncio, p_perfil, (select auth.uid()), 'conta:' || (select auth.uid()), privado.notas_validas(p_anuncio, p_notas),
          p_recomendacao, left(v_comentario, 1000))
  on conflict (anuncio_id, perfil_id, chave) do update
    set notas = excluded.notas, recomendacao = excluded.recomendacao, comentario = excluded.comentario, atualizado_em = now();
end
$$;

-- as avaliações de um candidato: a minha e, só depois de eu avaliar, as dos outros
create or replace function public.avaliacoes_do_candidato(p_anuncio uuid, p_perfil uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_chave text := 'conta:' || (select auth.uid());
  v_minha boolean;
begin
  perform privado.minha_vaga_para_avaliar(p_anuncio);
  v_minha := exists (select 1 from public.avaliacoes_candidato a where a.anuncio_id = p_anuncio and a.perfil_id = p_perfil and a.chave = v_chave);
  return jsonb_build_object(
    'total', (select count(*) from public.avaliacoes_candidato a where a.anuncio_id = p_anuncio and a.perfil_id = p_perfil),
    'avaliei', v_minha,
    'avaliacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'quem', coalesce(a.quem, split_part(p.nome, ' ', 1), 'Alguém da equipe'),
               'minha', a.chave = v_chave, 'pelo_link', a.autor_id is null,
               'notas', a.notas, 'recomendacao', a.recomendacao, 'comentario', a.comentario,
               'quando', a.atualizado_em) order by a.chave = v_chave desc, a.atualizado_em)
        from public.avaliacoes_candidato a left join public.perfis p on p.id = a.autor_id
       where a.anuncio_id = p_anuncio and a.perfil_id = p_perfil and (v_minha or a.chave = v_chave)), '[]'::jsonb));
end
$$;

-- por candidato da vaga: quantos avaliaram e, quando eu já avaliei, a média e as recomendações
create or replace function public.avaliacoes_time_da_vaga(p_anuncio uuid)
returns table (perfil_id uuid, total integer, avaliei boolean, media numeric, seguir integer, talvez integer, nao_seguir integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_chave text := 'conta:' || (select auth.uid());
begin
  perform privado.minha_vaga_para_avaliar(p_anuncio);
  return query
  select a.perfil_id, count(*)::integer,
         bool_or(a.chave = v_chave),
         case when bool_or(a.chave = v_chave) then round(avg(n.v), 1) end,
         case when bool_or(a.chave = v_chave) then count(*) filter (where a.recomendacao = 'seguir')::integer end,
         case when bool_or(a.chave = v_chave) then count(*) filter (where a.recomendacao = 'talvez')::integer end,
         case when bool_or(a.chave = v_chave) then count(*) filter (where a.recomendacao = 'nao_seguir')::integer end
    from public.avaliacoes_candidato a
    left join lateral (select avg((x.value)::numeric) as v from jsonb_each_text(a.notas) x) n on true
   where a.anuncio_id = p_anuncio
   group by a.perfil_id;
end
$$;

-- o gestor avalia pelo link dos finalistas (sem conta; o nome é obrigatório)
create or replace function public.avaliar_pelo_link(p_token text, p_id uuid, p_quem text, p_notas jsonb,
                                                    p_recomendacao text, p_comentario text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.links_finalistas;
  f public.finalistas;
  v_quem text := nullif(btrim(regexp_replace(coalesce(p_quem, ''), '\s+', ' ', 'g')), '');
  v_comentario text := nullif(btrim(coalesce(p_comentario, '')), '');
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' or p_id is null then
    return 'invalido';
  end if;
  select * into l from public.links_finalistas x where x.token = p_token;
  if not found or privado.situacao_link_finalistas(l) <> 'valido' then
    return 'invalido';
  end if;
  select * into f from public.finalistas x where x.id = p_id and x.anuncio_id = l.anuncio_id;
  if f.id is null then
    return 'invalido';
  end if;
  if v_quem is null or char_length(v_quem) < 2 then
    return 'sem_nome';
  end if;
  if p_recomendacao not in ('seguir', 'talvez', 'nao_seguir') then
    return 'invalido';
  end if;
  insert into public.avaliacoes_candidato (anuncio_id, perfil_id, quem, chave, notas, recomendacao, comentario)
  values (f.anuncio_id, f.perfil_id, left(v_quem, 80), 'link:' || lower(left(v_quem, 80)),
          privado.notas_validas(f.anuncio_id, p_notas), p_recomendacao, left(v_comentario, 1000))
  on conflict (anuncio_id, perfil_id, chave) do update
    set notas = excluded.notas, recomendacao = excluded.recomendacao, comentario = excluded.comentario, atualizado_em = now();
  return 'ok';
end
$$;

create or replace function public.finalistas_do_link(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  l public.links_finalistas;
  v_situacao text;
  v_previa boolean;
  r jsonb;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into l from public.links_finalistas x where x.token = p_token;
  if not found then
    return null;
  end if;
  v_situacao := privado.situacao_link_finalistas(l);
  -- a própria agência olhando ("ver como o cliente"): não conta como o cliente abrindo
  v_previa := exists (select 1 from public.anuncios a where a.id = l.anuncio_id and a.autor_id = (select public.conta_atual()));
  if v_situacao = 'valido' and not v_previa then
    update public.links_finalistas x
       set aberto_em = now(), aberturas = x.aberturas + 1
     where x.anuncio_id = l.anuncio_id;
  end if;
  select jsonb_build_object(
    'situacao', v_situacao,
    'previa', v_previa,
    'expira_em', l.expira_em,
    'agencia', jsonb_build_object('nome', p.nome, 'foto', p.foto, 'verificado', p.verificado, 'tipo', p.tipo),
    -- a ficha de avaliação da vaga (migração 20270107120000): o gestor avalia pelo link
    'competencias', case when v_situacao = 'valido'
                         then (select fa.competencias from public.fichas_avaliacao fa where fa.anuncio_id = l.anuncio_id) end,
    'vaga', case when v_situacao = 'valido' then jsonb_build_object(
      'titulo', a.titulo,
      'cidade', a.cidade,
      'bairro', a.bairro,
      'regime', a.regime,
      'cliente', coalesce(ca.nome, nullif(btrim(a.contratante), '')),
      'perguntas', coalesce(a.perguntas, '[]'::jsonb)
    ) end,
    'finalistas', case when v_situacao = 'valido' then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id,
               'nome', pf.nome,
               'foto', pf.foto,
               'cidade', pf.cidade,
               'bairro', pf.bairro,
               'parecer', f.parecer,
               'decisao', f.decisao,
               'comentario', f.comentario,
               'quem', f.quem,
               'decidido_em', f.decidido_em,
               'respostas', c.respostas,
               'curriculo', case when cv.perfil_id is null then null else jsonb_build_object(
                 'titulo', cv.titulo,
                 'habilidades', cv.habilidades,
                 'escolaridade', cv.escolaridade,
                 'curso', cv.curso,
                 'estudos', cv.estudos,
                 'experiencias', cv.experiencias,
                 'cursos', cv.cursos,
                 'cnh', cv.cnh,
                 'disponibilidade', cv.disponibilidade,
                 'atualizado_em', cv.atualizado_em
               ) end
             ) order by f.criado_em, f.id)
        from public.finalistas f
        join public.curtidas c on c.anuncio_id = f.anuncio_id and c.perfil_id = f.perfil_id
        join public.perfis pf on pf.id = f.perfil_id
        left join public.curriculos cv on cv.perfil_id = f.perfil_id
       where f.anuncio_id = a.id and c.status = 'match'
    ), '[]'::jsonb) end
  ) into r
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.clientes_agencia ca on ca.id = a.cliente_id
   where a.id = l.anuncio_id;
  return r;
end
$function$;

revoke all on function privado.minha_vaga_para_avaliar(uuid), privado.notas_validas(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ficha_avaliacao(uuid), public.salvar_ficha_avaliacao(uuid, text[]),
                       public.avaliar_candidato(uuid, uuid, jsonb, text, text), public.avaliacoes_do_candidato(uuid, uuid),
                       public.avaliacoes_time_da_vaga(uuid) from public, anon;
grant execute on function public.ficha_avaliacao(uuid), public.salvar_ficha_avaliacao(uuid, text[]),
                          public.avaliar_candidato(uuid, uuid, jsonb, text, text), public.avaliacoes_do_candidato(uuid, uuid),
                          public.avaliacoes_time_da_vaga(uuid) to authenticated;
revoke all on function public.avaliar_pelo_link(text, uuid, text, jsonb, text, text) from public;
grant execute on function public.avaliar_pelo_link(text, uuid, text, jsonb, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
