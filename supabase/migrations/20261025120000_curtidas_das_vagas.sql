-- Quantas curtidas cada vaga recebeu, para a linha do tempo ("8 pessoas já curtiram esta vaga").
-- Só o número: quem curtiu nunca aparece (a pessoa pode estar empregada e procurando escondido).
-- E só a partir de 3 curtidas, para o número não entregar ninguém (com 1 ou 2, quem conhece a
-- vaga poderia adivinhar). Só vagas no ar; a empresa ou a agência da vaga aparece como sempre.

create index if not exists curtidas_anuncio_criado_idx on public.curtidas (anuncio_id, criado_em desc);

create or replace function public.curtidas_das_vagas(p_ids uuid[])
returns table (anuncio_id uuid, curtidas integer, ultima timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.anuncio_id, count(*)::integer as curtidas, max(c.criado_em) as ultima
  from public.curtidas c
  join public.anuncios a on a.id = c.anuncio_id
  where c.anuncio_id = any ((coalesce(p_ids, '{}'::uuid[]))[1:100])
    and a.tipo = 'vaga'
    and a.status = 'ativo'
    and a.preenchida_em is null
    and (a.expira_em is null or a.expira_em > now())
  group by c.anuncio_id
  having count(*) >= 3
$$;

revoke execute on function public.curtidas_das_vagas(uuid[]) from public;
grant execute on function public.curtidas_das_vagas(uuid[]) to anon, authenticated;
