-- Respostas que viram notícia (09/11/2026; claude/plano-posts-e-conquistas.md, parte 4). Pode rodar de novo.
-- Rode depois de 20270323120000_modelos_do_post.sql.
--
-- Quando quem publicou responde um comentário, o feed de quem vê a vaga mostra: "Padaria Pão Quente respondeu sobre
-- a vaga Auxiliar de cozinha", com a pergunta e a resposta. Uma por vaga (a mais nova dos últimos 7 dias). Os
-- comentários no ar já são públicos.

create or replace function public.respostas_recentes_das_vagas(p_ids uuid[])
returns table (
  anuncio_id uuid,
  titulo text,
  empresa_id uuid,
  empresa_nome text,
  empresa_foto text,
  empresa_tipo text,
  pergunta_nome text,
  pergunta_texto text,
  resposta_texto text,
  quando timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (r.anuncio_id)
         r.anuncio_id, a.titulo, pa.id, pa.nome, pa.foto, pa.tipo,
         coalesce(privado.nome_no_comentario(q.autor_id), 'Conta do Publike'),
         left(regexp_replace(q.texto, '\s+', ' ', 'g'), 200),
         left(regexp_replace(r.texto, '\s+', ' ', 'g'), 280),
         coalesce(r.publicado_em, r.criado_em)
    from public.comentarios r
    join public.comentarios q on q.id = r.resposta_a and q.status = 'no_ar'
    join public.anuncios a on a.id = r.anuncio_id and a.autor_id = r.autor_id and a.tipo = 'vaga' and a.status = 'ativo'
    join public.perfis pa on pa.id = a.autor_id
   where r.anuncio_id = any (p_ids[1:200])
     and r.status = 'no_ar'
     and q.autor_id <> r.autor_id
     and coalesce(r.publicado_em, r.criado_em) > now() - interval '7 days'
     and (pa.suspenso_ate is null or pa.suspenso_ate <= now())
   order by r.anuncio_id, coalesce(r.publicado_em, r.criado_em) desc
$$;
revoke execute on function public.respostas_recentes_das_vagas(uuid[]) from public;
grant execute on function public.respostas_recentes_das_vagas(uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';
