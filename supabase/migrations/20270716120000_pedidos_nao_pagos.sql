-- Os pedidos de assinatura que não foram pagos saem sozinhos (17/11/2026, Marcelo: "preciso que resolva isso", sobre as
-- duas assinaturas pendentes com o preço antigo). Pode rodar de novo.
--
--   * Cartão: o checkout do parceiro (Asaas) vale 60 minutos. O pedido pendente que ainda não tem assinatura no
--     parceiro, depois de 1 dia, não tem mais como ser pago: é cancelado aqui, sem aviso (a pessoa largou o checkout).
--     Antes, o robô procura no parceiro as assinaturas do cliente (como na volta do checkout), para o aviso atrasado de
--     um cartão que passou não chegar a um pedido já cancelado.
--   * Pix: a assinatura existe no parceiro e gera uma cobrança por ciclo, mesmo sem a primeira paga. Sem nenhuma paga e
--     com a primeira vencida há mais de 3 dias, o robô (/api/filas, src/lib/servidor/pagamentos.ts) cancela no parceiro
--     e depois aqui, e o sino avisa a conta: "O pedido não foi pago e foi cancelado". O pedido de teste (o sandbox do
--     Asaas, das contas de teste dos pagamentos) sai com 7 dias, mesmo antes de vencer.
--   Assim, um pedido com o preço de antes não fica esperando pagamento, e o parceiro não cria cobrança nova dele.

-- os pedidos que o robô pode cancelar (até 20 por volta)
create or replace function public.servidor_pedidos_nao_pagos(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'conta', x.conta_id, 'asaas_id', x.asaas_id, 'sandbox', x.sandbox,
                                        'forma', x.forma)
                     order by x.criada_em)
      from (select a.id, a.conta_id, nullif(a.asaas_id, '') as asaas_id, a.sandbox, a.forma, a.criada_em
              from privado.assinaturas a
             where a.situacao = 'pendente'
               and (
                 -- o checkout do cartão que não virou assinatura no parceiro
                 (coalesce(a.asaas_id, '') = '' and a.criada_em < now() - interval '1 day')
                 -- o Pix sem nenhuma cobrança paga e com a primeira vencida há mais de 3 dias; o de teste (o sandbox
                 -- do Asaas, das contas de teste), com mais de 7 dias
                 or (coalesce(a.asaas_id, '') <> ''
                     and not exists (select 1 from privado.cobrancas c
                                      where c.assinatura_id = a.id and c.situacao in ('paga', 'estornada'))
                     and ((select min(c.vencimento) from privado.cobrancas c where c.assinatura_id = a.id) < v_hoje - 3
                          or (a.sandbox and a.criada_em < now() - interval '7 days')))
               )
             order by a.criada_em
             limit 20) x), '[]'::jsonb);
end
$$;

-- cancela o pedido (o do Pix, depois de cancelado no parceiro) e as cobranças abertas dele. `p_asaas_id`: a assinatura
-- do parceiro que o robô cancelou (null no checkout do cartão); se o pedido ganhou outra nesse meio-tempo (o aviso de um
-- cartão que passou), fica como está. Devolve se cancelou.
drop function if exists public.servidor_pedido_nao_pago_cancelado(text, uuid);
create or replace function public.servidor_pedido_nao_pago_cancelado(p_chave text, p_assinatura uuid, p_asaas_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a privado.assinaturas;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.assinaturas set situacao = 'cancelada', cancelada_em = coalesce(cancelada_em, now())
   where id = p_assinatura and situacao = 'pendente' and coalesce(asaas_id, '') = coalesce(p_asaas_id, '')
  returning * into a;
  if a.id is null then
    return false;
  end if;
  update privado.cobrancas set situacao = 'cancelada', atualizado_em = now()
   where assinatura_id = a.id and situacao in ('pendente', 'atrasada', 'recusada');
  -- o Pix teve a cobrança na tela de faturas: avisa; o checkout largado do cartão, não
  if coalesce(a.asaas_id, '') <> '' then
    perform privado.avisar_pagamento(a.conta_id,
      'O pedido do ' || privado.nome_do_recurso(a.recurso)
      || ' não foi pago e foi cancelado. Para assinar, é só pedir de novo em Planos.',
      '/painel/planos');
  end if;
  return true;
end
$$;

-- como as outras funções do servidor: quem chama é o site, com a chave do servidor (privado.exigir_servidor confere)
revoke execute on function public.servidor_pedidos_nao_pagos(text),
  public.servidor_pedido_nao_pago_cancelado(text, uuid, text) from public;
grant execute on function public.servidor_pedidos_nao_pagos(text),
  public.servidor_pedido_nao_pago_cancelado(text, uuid, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270716120000_pedidos_nao_pagos');
