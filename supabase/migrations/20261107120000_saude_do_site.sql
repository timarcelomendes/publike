-- Saúde do site: o quadro verde/vermelho no topo do painel do admin.
-- Uma leitura só, com o que pode parar sem ninguém ver: a fila de e-mails, a revisão da IA, a chave
-- que o site publicado usa para esvaziar as filas, o que espera a moderação e as falhas de cadastro.
-- "Parado" = devia ter saído há mais de 10 minutos (tentar_depois passou) e continua na fila.

create or replace function public.admin_saude()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  limite timestamptz := now() - interval '10 minutes';
begin
  perform privado.exigir_admin();
  return jsonb_build_object(
    'agora', now(),
    'emails', jsonb_build_object(
      'parados', (select count(*) from privado.fila_emails e
                   where e.status in ('pendente', 'enviando') and e.tentar_depois < limite),
      'parado_desde', (select min(e.tentar_depois) from privado.fila_emails e
                        where e.status in ('pendente', 'enviando') and e.tentar_depois < limite),
      'na_fila', (select count(*) from privado.fila_emails e where e.status in ('pendente', 'enviando')),
      'falharam_24h', (select count(*) from privado.fila_emails e
                        where e.status = 'falhou' and e.criado_em > now() - interval '24 hours'),
      'ultimo_enviado', (select max(e.enviado_em) from privado.fila_emails e where e.status = 'enviado')
    ),
    'ia', jsonb_build_object(
      'ligada', (select c.ia_moderacao from public.config_site c limit 1),
      'parados', (select count(*) from privado.fila_ia f where f.tentar_depois < limite)
                 + (select count(*) from privado.fila_ia_recados f where f.tentar_depois < limite)
                 + (select count(*) from privado.fila_ia_avaliacoes f where f.tentar_depois < limite),
      'parado_desde', (select min(t) from (
                         select min(f.tentar_depois) as t from privado.fila_ia f where f.tentar_depois < limite
                         union all
                         select min(f.tentar_depois) from privado.fila_ia_recados f where f.tentar_depois < limite
                         union all
                         select min(f.tentar_depois) from privado.fila_ia_avaliacoes f where f.tentar_depois < limite
                       ) x),
      'erros_24h', (select count(*) from public.moderacao_ia m
                     where m.decisao = 'erro' and m.criado_em > now() - interval '24 hours'),
      'ultima_revisao', (select max(m.criado_em) from public.moderacao_ia m
                          where coalesce(m.modelo, '') <> 'moderação')
    ),
    'chaves', coalesce((select jsonb_agg(jsonb_build_object('nome', k.nome, 'criada_em', k.criada_em,
                                                            'usada_em', k.usada_em) order by k.criada_em desc)
                          from privado.chaves_servidor k), '[]'::jsonb),
    'moderacao', jsonb_build_object(
      'anuncios', (select count(*) from public.anuncios a where a.status = 'em_analise'),
      'recados', (select count(*) from public.recados r where r.status = 'retido'),
      'avaliacoes', (select count(*) from public.avaliacoes v where v.status = 'retida' or v.resposta_status = 'retida'),
      'denuncias', (select count(*) from public.denuncias d where d.status = 'aberta')
                   + (select count(*) from public.denuncias_recados d where d.status = 'aberta'),
      'desde', (select min(t) from (
                  select min(a.atualizado_em) as t from public.anuncios a where a.status = 'em_analise'
                  union all
                  select min(r.criado_em) from public.recados r where r.status = 'retido'
                  union all
                  select min(v.atualizado_em) from public.avaliacoes v
                   where v.status = 'retida' or v.resposta_status = 'retida'
                  union all
                  select min(d.criado_em) from public.denuncias d where d.status = 'aberta'
                  union all
                  select min(d.criado_em) from public.denuncias_recados d where d.status = 'aberta'
                ) x)
    ),
    'falhas', jsonb_build_object(
      'sistema_24h', (select count(*) from privado.falhas_cadastro f
                       where f.etapa <> 'validacao' and f.criado_em > now() - interval '24 hours'),
      'ultima', (select max(f.criado_em) from privado.falhas_cadastro f where f.etapa <> 'validacao')
    )
  );
end
$$;

revoke execute on function public.admin_saude() from public, anon, authenticated;
grant execute on function public.admin_saude() to service_role;

notify pgrst, 'reload schema';
