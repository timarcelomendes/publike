-- Moderação › Esperando a IA (02/11/2026). Pode rodar de novo.
-- O recado e a avaliação ficam escondidos enquanto esperam a IA. Se a revisão não roda (a chave do
-- servidor ou a da IA errada no site publicado), eles sumiam: não estavam no ar nem na fila da equipe.
-- Agora, parados na fila da IA há mais de 15 minutos, aparecem para a equipe com a situação
-- 'esperando_ia'. O resto igual a 20261022120000_recados e 20261009180000_avaliacoes.

create or replace function public.fila_recados()
returns table (
  recado_id uuid,
  situacao text,
  texto text,
  foto text,
  status text,
  autor_id uuid,
  autor_nome text,
  cidade text,
  bairro text,
  anuncio_titulo text,
  denuncias_abertas integer,
  motivos text[],
  detalhes text[],
  ia_categorias text[],
  ia_explicacao text,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_equipe();
  return query
    select r.id,
           case when r.status = 'retido' then 'retido'
                when r.status = 'revisao' and exists (select 1 from privado.fila_ia_recados f where f.recado_id = r.id)
                  then 'esperando_ia'
                when r.status = 'revisao' then 'sem_revisao'
                else 'denunciado' end,
           r.texto, r.foto, r.status, r.autor_id, p.nome, r.cidade, r.bairro, a.titulo,
           (select count(*)::integer from public.denuncias_recados d where d.recado_id = r.id and d.status = 'aberta'),
           coalesce((select array_agg(distinct d.motivo) from public.denuncias_recados d
                      where d.recado_id = r.id and d.status = 'aberta'), '{}'),
           coalesce((select array_agg(d.detalhes order by d.criado_em) from public.denuncias_recados d
                      where d.recado_id = r.id and d.status = 'aberta' and d.detalhes is not null), '{}'),
           coalesce(ia.categorias, '{}'), ia.explicacao, r.criado_em
      from public.recados r
      join public.perfis p on p.id = r.autor_id
      left join public.anuncios a on a.id = r.anuncio_id
      left join lateral (
        select m.categorias, m.explicacao from public.moderacao_ia_recados m
         where m.recado_id = r.id order by m.criado_em desc, m.id desc limit 1
      ) ia on true
     where r.status = 'retido'
        or (r.status = 'no_ar' and exists (
              select 1 from public.denuncias_recados d where d.recado_id = r.id and d.status = 'aberta'))
        or (r.status = 'revisao' and not exists (select 1 from privado.fila_ia_recados f where f.recado_id = r.id))
        -- na fila da IA há mais de 15 minutos: a revisão não está rodando (chave do servidor, chave da IA)
        or (r.status = 'revisao' and r.criado_em < now() - interval '15 minutes')
     order by (r.status = 'retido') desc, r.criado_em desc;
end
$$;

create or replace function public.fila_avaliacoes()
returns table (
  avaliacao_id bigint,
  parte text,
  situacao text,
  texto text,
  nota smallint,
  titulo_servico text,
  anuncio_id uuid,
  escritor_id uuid,
  escritor_nome text,
  escritor_advertencias integer,
  profissional_id uuid,
  profissional_nome text,
  ia_categorias text[],
  ia_explicacao text,
  motivo_denuncia text,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_equipe();
  return query
    with itens as (
      -- comentário retido, que a IA não revisou, ou denunciado
      select v.id, 'comentario'::text as parte,
             case when v.status = 'retida' then 'retida'
                  when v.status = 'pendente' and exists (
                         select 1 from privado.fila_ia_avaliacoes f where f.avaliacao_id = v.id and f.parte = 'comentario')
                    then 'esperando_ia'
                  when v.status = 'pendente' then 'sem_revisao'
                  else 'denunciada' end as situacao,
             v.comentario as texto, v.autor_id as escritor, v.motivo_denuncia, v.criado_em
        from public.avaliacoes v
       where v.status = 'retida'
          or (v.status = 'publicada' and v.denunciada_em is not null)
          or (v.status = 'pendente' and not exists (
                select 1 from privado.fila_ia_avaliacoes f where f.avaliacao_id = v.id and f.parte = 'comentario'))
          or (v.status = 'pendente' and v.criado_em < now() - interval '15 minutes')
      union all
      select v.id, 'resposta'::text,
             case when v.resposta_status = 'retida' then 'retida'
                  when exists (select 1 from privado.fila_ia_avaliacoes f where f.avaliacao_id = v.id and f.parte = 'resposta')
                    then 'esperando_ia'
                  else 'sem_revisao' end,
             v.resposta, v.profissional_id, null::text, v.respondida_em
        from public.avaliacoes v
       where v.resposta_status = 'retida'
          or (v.resposta_status = 'pendente' and not exists (
                select 1 from privado.fila_ia_avaliacoes f where f.avaliacao_id = v.id and f.parte = 'resposta'))
          or (v.resposta_status = 'pendente' and v.respondida_em < now() - interval '15 minutes')
    )
    select i.id, i.parte, i.situacao, i.texto, v.nota, v.titulo_servico, v.anuncio_id,
           i.escritor, pe.nome,
           (select count(*)::integer from public.advertencias ad where ad.perfil_id = i.escritor),
           v.profissional_id, pp.nome,
           coalesce(ia.categorias, '{}'), ia.explicacao,
           i.motivo_denuncia, i.criado_em
      from itens i
      join public.avaliacoes v on v.id = i.id
      join public.perfis pe on pe.id = i.escritor
      join public.perfis pp on pp.id = v.profissional_id
      left join lateral (
        select m.categorias, m.explicacao from public.moderacao_ia_avaliacoes m
         where m.avaliacao_id = i.id and m.parte = i.parte
         order by m.criado_em desc, m.id desc limit 1
      ) ia on true
     order by (i.situacao = 'retida') desc, i.criado_em desc;
end
$$;

notify pgrst, 'reload schema';
