-- Admin › Pagamentos e o Painel do admin: os avisos do Asaas chegando (o último, quantos em 7 dias e com
-- erro). Só contagens e datas, sem dado de conta. Pode rodar de novo.
create or replace function public.admin_pagamentos_situacao()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ultimo_aviso', (select max(e.recebido_em) from privado.eventos_pagamento e),
    'ultimo_tipo', (select e.tipo from privado.eventos_pagamento e order by e.recebido_em desc limit 1),
    'avisos_7d', (select count(*) from privado.eventos_pagamento e where e.recebido_em > now() - interval '7 days'),
    'erros_7d', (select count(*) from privado.eventos_pagamento e
                  where e.recebido_em > now() - interval '7 days' and e.erro is not null and e.processado_em is null),
    'aberto', (select c.aberto from privado.config_pagamentos c where c.id),
    'planos_a_venda', (select count(*) from privado.planos p where p.ligado and p.valor is not null),
    'contas_teste', (select count(*) from privado.pagamentos_teste),
    'servico_nota', (select c.servico_nota is not null from privado.config_pagamentos c where c.id),
    'ativas', (select count(*) from privado.assinaturas a where a.situacao = 'ativa')
  )
$$;
revoke execute on function public.admin_pagamentos_situacao() from public, anon, authenticated;
grant execute on function public.admin_pagamentos_situacao() to service_role;
notify pgrst, 'reload schema';
