-- O jeito de trabalhar, no lugar do teste comportamental (08/11/2026; claude/plano-pedido-do-cliente-convites-e-testes.md,
-- parte 6). Pode rodar de novo.
--
-- Por que não um teste comportamental: a Lei 4.119/1962 (art. 13, § 1º) faz do uso de métodos e técnicas
-- psicológicas para "orientação e seleção profissional" função privativa do psicólogo, e o CFP (Resolução 31/2022) liga
-- o uso dos testes psicológicos ao SATEPSI. Aqui a pessoa só conta do que gosta e o que prefere evitar: não é teste,
-- não tem certo nem errado, tudo é opcional. Nada de saúde, religião ou família.
--
-- 1. curriculos.jeito: "publico:sim", "peso:nao"... (src/lib/jeito-de-trabalhar.ts).
-- 2. anuncios.dia_a_dia: como é o trabalho da vaga ("publico", "peso"...).
-- 3. jeitos_de_trabalhar: o jeito das pessoas que a conta já pode ver (em Talentos, ou que curtiram uma vaga dela).

alter table public.curriculos add column if not exists jeito text[] not null default '{}';
alter table public.curriculos drop constraint if exists curriculos_jeito;
alter table public.curriculos add constraint curriculos_jeito check (
  jeito <@ array['publico:sim', 'publico:nao', 'em_pe:sim', 'em_pe:nao', 'peso:sim', 'peso:nao', 'corrido:sim',
                 'corrido:nao', 'equipe:sim', 'equipe:nao', 'rua:sim', 'rua:nao', 'viagem:sim', 'viagem:nao']::text[]
  and cardinality(jeito) <= 7);
grant insert (jeito), update (jeito) on public.curriculos to authenticated;

alter table public.anuncios add column if not exists dia_a_dia text[] not null default '{}';
alter table public.anuncios drop constraint if exists anuncios_dia_a_dia;
alter table public.anuncios add constraint anuncios_dia_a_dia check (
  dia_a_dia <@ array['publico', 'em_pe', 'peso', 'corrido', 'equipe', 'rua', 'viagem']::text[]);
grant insert (dia_a_dia), update (dia_a_dia) on public.anuncios to authenticated;

create or replace function public.jeitos_de_trabalhar(p_perfis uuid[])
returns table (perfil_id uuid, jeito text[])
language sql
stable
security definer
set search_path = ''
as $$
  select c.perfil_id, c.jeito
    from public.curriculos c
   where c.perfil_id = any (p_perfis[1:200])
     and cardinality(c.jeito) > 0
     and (c.perfil_id = (select auth.uid())
          or (exists (select 1 from public.perfis eu where eu.id = (select public.conta_atual()) and eu.tipo <> 'pessoa')
              and (exists (select 1 from public.curriculo_visivel v where v.perfil_id = c.perfil_id)
                   or exists (select 1 from public.curtidas k join public.anuncios a on a.id = k.anuncio_id
                               where k.perfil_id = c.perfil_id and a.autor_id = (select public.conta_atual())))))
$$;
revoke execute on function public.jeitos_de_trabalhar(uuid[]) from public, anon;
grant execute on function public.jeitos_de_trabalhar(uuid[]) to authenticated;

notify pgrst, 'reload schema';
