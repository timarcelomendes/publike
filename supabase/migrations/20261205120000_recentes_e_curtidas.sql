-- Recentes só pela publicação, e as curtidas e os matches à vista (28/10/2026). Pode rodar de novo.
--
-- 1. Na ordem "ultimas" (Recentes, na linha do tempo), a vaga vale só pela hora da publicação: a curtida
--    não faz mais a vaga subir. Quem leva a curtida em conta é "Relevantes para você" (no site: os pontos
--    "em alta", em src/lib/relevancia.ts).
-- 2. curtidas_das_vagas devolve o número de curtidas a partir de 1 (antes, só a partir de 3) e quantas
--    viraram match. Só os números: quem curtiu nunca aparece.

-- 1. buscar_anuncios (de 20261101120000_relevancia_das_vagas.sql): troca só a hora da ordem "ultimas"
do $$
declare
  fn regprocedure := 'public.buscar_anuncios(double precision, double precision, double precision, text, text, text, text, text, integer, text, text, text[], text, boolean)'::regprocedure;
  antes text := 'then greatest(x.criado_em, coalesce(privado.ultima_curtida(x.id), x.criado_em))';
  def text;
begin
  def := pg_catalog.pg_get_functiondef(fn);
  if position(antes in def) > 0 then
    execute replace(def, antes, 'then x.criado_em');
  end if;
end
$$;

-- 2. as curtidas e os matches de cada vaga no ar
drop function if exists public.curtidas_das_vagas(uuid[]);
create function public.curtidas_das_vagas(p_ids uuid[])
returns table (anuncio_id uuid, curtidas integer, matches integer, ultima timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.anuncio_id,
         count(*)::integer as curtidas,
         (count(*) filter (where c.status = 'match'))::integer as matches,
         max(c.criado_em) as ultima
  from public.curtidas c
  join public.anuncios a on a.id = c.anuncio_id
  where c.anuncio_id = any ((coalesce(p_ids, '{}'::uuid[]))[1:200])
    and a.tipo = 'vaga'
    and a.status = 'ativo'
    and a.preenchida_em is null
    and (a.expira_em is null or a.expira_em > now())
  group by c.anuncio_id
$$;
revoke execute on function public.curtidas_das_vagas(uuid[]) from public;
grant execute on function public.curtidas_das_vagas(uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';
