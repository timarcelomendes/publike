-- A home de quem entrou vira uma linha do tempo (21/10/2026). Pode rodar de novo sem problema.
--
--   * Em `preferencias` (que só a própria pessoa lê e escreve): a última vez que ela abriu a home
--     (home_vista_em), onde fica a marca "Você parou aqui" nesta visita (home_marca_em), a última
--     aba escolhida (home_aba) e o fundo do topo (fundo e fundo_arquivo). Ficam aqui e não em
--     `perfis`, que todo mundo lê: a hora da visita e o fundo são só da pessoa.
--   * O bucket privado `fundos`: a foto que a pessoa escolhe para o fundo do topo. Pasta por
--     pessoa (fundos/<id-do-usuário>/...), só a dona vê, conta suspensa não envia.
--
-- Rode depois de 20261020180000_conversa_unica.sql.

-- 1. As preferências da home ----------------------------------------------------------------------

alter table public.preferencias add column if not exists home_vista_em timestamptz;
alter table public.preferencias add column if not exists home_marca_em timestamptz;
alter table public.preferencias add column if not exists home_aba text;
alter table public.preferencias add column if not exists fundo text not null default 'preto';
alter table public.preferencias add column if not exists fundo_arquivo text;

alter table public.preferencias drop constraint if exists preferencias_home_aba_check;
alter table public.preferencias add constraint preferencias_home_aba_check
  check (home_aba in ('tudo', 'vaga', 'servico', 'recado'));
alter table public.preferencias drop constraint if exists preferencias_fundo_check;
alter table public.preferencias add constraint preferencias_fundo_check
  check (fundo in ('preto', 'luzes', 'amanhecer', 'folhas', 'terra', 'pinos', 'foto'));
alter table public.preferencias drop constraint if exists preferencias_fundo_arquivo_check;
alter table public.preferencias add constraint preferencias_fundo_arquivo_check
  check (fundo_arquivo is null or char_length(fundo_arquivo) <= 200);

comment on column public.preferencias.home_vista_em is 'A última vez que a pessoa abriu a home (linha do tempo).';
comment on column public.preferencias.home_marca_em is 'Onde fica o "Você parou aqui" nesta visita (a visita anterior).';
comment on column public.preferencias.fundo is 'O fundo do topo da home: uma das imagens prontas ou a foto da pessoa (foto).';

-- a pessoa escreve só nas colunas dela (como já era com `procuro`)
grant insert (procuro, home_vista_em, home_marca_em, home_aba, fundo, fundo_arquivo),
      update (procuro, home_vista_em, home_marca_em, home_aba, fundo, fundo_arquivo)
  on public.preferencias to authenticated;


-- 2. A foto do fundo (Storage) --------------------------------------------------------------------
-- Pasta por pessoa: fundos/<id-do-usuário>/<data>.jpg. Privada: só a dona vê (por link assinado).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fundos', 'fundos', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "publike: dono vê o próprio fundo" on storage.objects;
drop policy if exists "publike: dono envia fundo" on storage.objects;
drop policy if exists "publike: dono troca fundo" on storage.objects;
drop policy if exists "publike: dono apaga fundo" on storage.objects;

create policy "publike: dono vê o próprio fundo" on storage.objects
  for select to authenticated
  using (bucket_id = 'fundos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "publike: dono envia fundo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fundos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and not (select public.minha_conta_suspensa()));
create policy "publike: dono troca fundo" on storage.objects
  for update to authenticated
  using (bucket_id = 'fundos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "publike: dono apaga fundo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fundos' and (storage.foldername(name))[1] = (select auth.uid())::text);
