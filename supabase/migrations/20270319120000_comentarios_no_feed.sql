-- Comentar no próprio feed (09/11/2026): cada vaga do feed mostra quantos comentários tem e o último (quem e o
-- começo do texto), e a conversa abre ali mesmo, sem sair do feed. Pode rodar de novo (mesmo depois da versão
-- anterior deste arquivo, que só contava). Rode depois de 20270318120000_comentarios.sql.

-- Para cada vaga: quantos comentários no ar ela tem, se aceita comentários e o último deles (qualquer pessoa: são
-- públicos). Até 200 vagas por vez.
drop function if exists public.comentarios_das_vagas(uuid[]);
create function public.comentarios_das_vagas(p_ids uuid[])
returns table (
  anuncio_id uuid,
  comentarios bigint,
  ligados boolean,
  ultimo_nome text,
  ultimo_texto text,
  ultimo_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select an.id, c.total, an.comentarios_ligados, u.nome, u.texto, u.criado_em
    from public.anuncios an
    cross join lateral (
      select count(*) as total
        from public.comentarios x
       where x.anuncio_id = an.id and x.status = 'no_ar'
    ) c
    left join lateral (
      select coalesce(privado.nome_no_comentario(y.autor_id), 'Conta do Publike') as nome,
             left(regexp_replace(y.texto, '\s+', ' ', 'g'), 140) as texto,
             y.criado_em
        from public.comentarios y
       where y.anuncio_id = an.id and y.status = 'no_ar'
       order by y.criado_em desc
       limit 1
    ) u on true
   where an.id = any (p_ids[1:200]) and an.tipo = 'vaga'
$$;
revoke execute on function public.comentarios_das_vagas(uuid[]) from public;
grant execute on function public.comentarios_das_vagas(uuid[]) to anon, authenticated;

-- o texto da novidade com um nome só: "comentar" (não "perguntar"), e no próprio feed
update public.novidades
   set texto = 'Ficou com dúvida sobre uma vaga? Comente ali mesmo no feed, embaixo da vaga, ou na página dela: quem publicou responde para todo mundo ver. Quem contrata recebe o aviso e pode esconder um comentário ou desligar os comentários da vaga.'
 where titulo = 'Comentários nas vagas';

notify pgrst, 'reload schema';
