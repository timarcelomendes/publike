-- Os comentários e o "Indicar" à vista (09/11/2026): o feed e a página da vaga mostram quantos comentários a vaga
-- tem, com o atalho para a seção. Pode rodar de novo. Rode depois de 20270318120000_comentarios.sql.

-- Quantos comentários no ar cada vaga tem (qualquer pessoa: são públicos). Até 200 vagas por vez.
create or replace function public.comentarios_das_vagas(p_ids uuid[])
returns table (anuncio_id uuid, comentarios bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.anuncio_id, count(*)
    from public.comentarios c
   where c.anuncio_id = any (p_ids[1:200]) and c.status = 'no_ar'
   group by c.anuncio_id
$$;
revoke execute on function public.comentarios_das_vagas(uuid[]) from public;
grant execute on function public.comentarios_das_vagas(uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';
