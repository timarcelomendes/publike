-- Situação das notificações no celular (13/11/2026): os números de produção para o admin
-- (Admin › Chaves › Notificações no celular): aparelhos inscritos, o que saiu e o que falhou nas
-- últimas 24 horas, o que espera na fila e o último erro. Só o service_role. Pode rodar de novo.

create or replace function public.admin_situacao_push()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'aparelhos', (select count(*) from privado.inscricoes_push),
    'contas', (select count(distinct i.conta_id) from privado.inscricoes_push i),
    'novos_7d', (select count(*) from privado.inscricoes_push i where i.criado_em > now() - interval '7 days'),
    'enviadas_24h', (select count(*) from privado.fila_push f
                      where f.status = 'enviado' and f.criado_em > now() - interval '24 hours'),
    'falhas_24h', (select count(*) from privado.fila_push f
                    where f.status = 'falhou' and f.criado_em > now() - interval '24 hours'),
    'na_fila', (select count(*) from privado.fila_push f where f.status in ('pendente', 'enviando')),
    'mais_antiga_na_fila', (select min(f.criado_em) from privado.fila_push f where f.status in ('pendente', 'enviando')),
    'ultima_enviada', (select max(i.enviada_em) from privado.inscricoes_push i),
    'ultimo_erro', (select f.erro from privado.fila_push f where f.erro is not null order by f.criado_em desc limit 1),
    'ultimo_erro_em', (select max(f.criado_em) from privado.fila_push f where f.erro is not null)
  )
$$;
revoke execute on function public.admin_situacao_push() from public, anon, authenticated;
grant execute on function public.admin_situacao_push() to service_role;
