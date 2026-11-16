-- Os números dos conteúdos: entre os que estão na vez (nunca conferidos, ou os conferidos há mais tempo), na ordem que
-- o site manda (os artigos da página inicial primeiro), e não na ordem alfabética.

create or replace function public.servidor_conteudos_para_conferir(p_chave text, p_slugs text[], p_quantos integer)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((
    select array_agg(x.s order by x.quando nulls first, x.ordem)
      from (select u.s, u.ordem, k.conferido_em as quando
              from unnest(p_slugs) with ordinality as u (s, ordem)
              left join privado.conteudos_conferidos k on k.slug = u.s
             where (k.conferido_em is null or k.conferido_em < now() - interval '7 days')
               and not exists (select 1 from privado.conteudos_atualizados a
                                where a.slug = u.s and a.situacao = 'rascunho')
             order by k.conferido_em nulls first, u.ordem
             limit least(greatest(coalesce(p_quantos, 1), 1), 5)) x
  ), '{}'::text[]);
end
$$;

select privado.migracao_aplicada('20270706120000_conteudos_na_ordem');
