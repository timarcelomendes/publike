-- Etapas dos candidatos: quem publicou uma vaga acompanha cada pessoa que curtiu.
--
-- Cada interessado ganha uma etapa (Novo, Em análise, Entrevista, Contratado,
-- Não seguiu) e uma anotação de até 1000 letras. Só quem publicou a vaga vê e
-- muda: a pessoa que curtiu nunca vê a etapa nem a anotação. A linha some junto
-- com a curtida (e com a conta de qualquer um dos dois).
--
-- Rode depois de 20261010120000_sugestoes_assistente.sql (pode rodar de novo sem problema).

create table if not exists public.etapas_candidatos (
  anuncio_id uuid not null,
  perfil_id uuid not null,
  etapa text not null default 'novo'
    check (etapa in ('novo', 'analise', 'entrevista', 'contratado', 'nao_seguiu')),
  nota text check (nota is null or char_length(nota) <= 1000),
  atualizado_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id),
  foreign key (anuncio_id, perfil_id) references public.curtidas (anuncio_id, perfil_id) on delete cascade
);

-- Sem acesso direto: só pelas duas funções abaixo, que conferem o dono da vaga.
alter table public.etapas_candidatos enable row level security;
revoke all on public.etapas_candidatos from anon, authenticated;

-- As etapas e anotações dos interessados de uma vaga minha.
create or replace function public.etapas_dos_candidatos(p_anuncio uuid)
returns table (perfil_id uuid, etapa text, nota text, atualizado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.perfil_id, e.etapa, e.nota, e.atualizado_em
    from public.etapas_candidatos e
    join public.anuncios a on a.id = e.anuncio_id
   where e.anuncio_id = p_anuncio
     and a.autor_id = (select auth.uid())
$$;

-- Muda a etapa e a anotação de alguém que curtiu uma vaga minha.
create or replace function public.salvar_etapa_candidato(p_anuncio uuid, p_perfil uuid, p_etapa text, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if public.minha_conta_suspensa() then
    raise exception 'Sua conta está suspensa. Se achar que é um engano, fale com a gente.'
      using errcode = 'P0001', hint = 'conta_suspensa';
  end if;
  if p_etapa is null or p_etapa not in ('novo', 'analise', 'entrevista', 'contratado', 'nao_seguiu') then
    raise exception 'Escolha uma etapa da lista.' using errcode = '22023';
  end if;
  if char_length(v_nota) > 1000 then
    raise exception 'A anotação passa de 1000 letras.' using errcode = '22023';
  end if;
  if not exists (
    select 1
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
     where c.anuncio_id = p_anuncio
       and c.perfil_id = p_perfil
       and a.autor_id = (select auth.uid())
  ) then
    raise exception 'Essa pessoa não curtiu um anúncio seu.' using errcode = '42501';
  end if;

  insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa, nota)
  values (p_anuncio, p_perfil, p_etapa, v_nota)
  on conflict (anuncio_id, perfil_id) do update
    set etapa = excluded.etapa, nota = excluded.nota, atualizado_em = now();
end
$$;

revoke execute on function public.etapas_dos_candidatos(uuid) from public, anon;
grant execute on function public.etapas_dos_candidatos(uuid) to authenticated;
revoke execute on function public.salvar_etapa_candidato(uuid, uuid, text, text) from public, anon;
grant execute on function public.salvar_etapa_candidato(uuid, uuid, text, text) to authenticated;
