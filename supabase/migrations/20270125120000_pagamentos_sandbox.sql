-- Produção e sandbox do Asaas juntos (claude/plano-pagamentos-sandbox.md). Com o site em produção, as contas
-- de teste marcadas "no sandbox" (Admin › Pagamentos › Contas de teste) pagam na conta sandbox do Asaas: nada
-- é cobrado de verdade. O cliente e a assinatura guardam de qual conta do Asaas são, para o Pix, a nota, o
-- cancelar e os avisos irem sempre à conta certa. Pode rodar de novo.
--
-- O que já existe foi feito no sandbox (o site ainda não tinha ligado a produção): fica marcado como sandbox, e
-- as contas de teste de hoje continuam pagando no sandbox (desmarque no Admin para a compra real).

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'privado' and table_name = 'pagamentos_teste' and column_name = 'sandbox') then
    alter table privado.pagamentos_teste add column sandbox boolean not null default false;
    update privado.pagamentos_teste set sandbox = true;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'privado' and table_name = 'clientes_pagamento' and column_name = 'sandbox') then
    alter table privado.clientes_pagamento add column sandbox boolean not null default false;
    update privado.clientes_pagamento set sandbox = true;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'privado' and table_name = 'assinaturas' and column_name = 'sandbox') then
    alter table privado.assinaturas add column sandbox boolean not null default false;
    update privado.assinaturas set sandbox = true;
  end if;
end
$$;

-- a conta de teste paga no sandbox (a tela de assinar avisa)
create or replace function public.servidor_pagamento_no_sandbox(p_chave text, p_conta uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((select t.sandbox from privado.pagamentos_teste t where t.conta_id = p_conta), false);
end
$$;

-- o contexto de assinar: o de 20270114120000, mais o sandbox da conta e o do cliente guardado
create or replace function public.servidor_pagamento_contexto(p_chave text, p_conta uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform privado.exigir_servidor(p_chave);
  return jsonb_build_object(
    'pode', privado.pode_pagar(p_conta),
    'sandbox', coalesce((select t.sandbox from privado.pagamentos_teste t where t.conta_id = p_conta), false),
    'nome', (select p.nome from public.perfis p where p.id = p_conta),
    'email', (select u.email from auth.users u where u.id = p_conta),
    'cliente', (select jsonb_build_object('asaas_id', c.asaas_id, 'cpf_cnpj', c.cpf_cnpj, 'nome', c.nome,
                                          'email', c.email, 'sandbox', c.sandbox)
                  from privado.clientes_pagamento c where c.conta_id = p_conta),
    'planos', coalesce((select jsonb_agg(jsonb_build_object('id', pl.id, 'recurso', pl.recurso, 'ciclo', pl.ciclo,
                                                           'valor', pl.valor))
                          from privado.planos pl where pl.ligado and pl.valor is not null), '[]'::jsonb),
    'ativas', coalesce((select jsonb_agg(a.recurso) from privado.assinaturas a
                         where a.conta_id = p_conta
                           and (a.situacao = 'ativa' or (a.situacao = 'pendente' and a.asaas_id is not null))),
                       '[]'::jsonb),
    'sem_prazo', jsonb_build_object(
      'copiloto', exists (select 1 from privado.copiloto_contas c where c.conta_id = p_conta and c.ate is null),
      'testes', exists (select 1 from privado.testes_contas t where t.conta_id = p_conta and t.ate is null),
      'video', exists (select 1 from privado.video_contas v where v.conta_id = p_conta and v.ate is null),
      'automacoes', exists (select 1 from privado.automacoes_contas v where v.conta_id = p_conta and v.ate is null)),
    'testes_ate', (select jsonb_object_agg(x.recurso, x.fim) from privado.experimentos x
                    where x.conta_id = p_conta and x.fim > now()),
    -- até quando já está pago (assinar de novo, ou trocar o cartão, começa a cobrar daí)
    'pago_ate', (select jsonb_object_agg(q.recurso, q.ate)
                   from (select c.recurso, max(c.periodo_ate) as ate from privado.cobrancas c
                          where c.conta_id = p_conta and c.situacao = 'paga' group by c.recurso) q
                  where q.ate > now()),
    'nota', (select jsonb_build_object('servico', c.servico_nota, 'e_codigo', c.servico_nota_e_codigo,
                                       'descricao', c.descricao_nota)
               from privado.config_pagamentos c where c.id and c.servico_nota is not null)
  );
end
$function$;

-- o cliente e a assinatura guardam de qual conta do Asaas são. As versões sem p_sandbox ficam, para o site no ar
-- continuar assinando entre esta migração e o push (gravam como produção)
create or replace function public.servidor_pagamento_cliente(p_chave text, p_conta uuid, p_asaas_id text,
                                                             p_cpf_cnpj text, p_nome text, p_email text,
                                                             p_sandbox boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.clientes_pagamento (conta_id, asaas_id, cpf_cnpj, nome, email, sandbox)
  values (p_conta, p_asaas_id, p_cpf_cnpj, p_nome, nullif(p_email, ''), coalesce(p_sandbox, false))
  on conflict (conta_id) do update
    set asaas_id = excluded.asaas_id, cpf_cnpj = excluded.cpf_cnpj, nome = excluded.nome,
        email = excluded.email, sandbox = excluded.sandbox, atualizado_em = now();
end
$$;

create or replace function public.servidor_pagamento_assinatura(p_chave text, p_conta uuid, p_plano uuid,
                                                                p_forma text, p_asaas_id text, p_checkout_id text,
                                                                p_proxima date, p_sandbox boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pl privado.planos;
  v_id uuid;
begin
  perform privado.exigir_servidor(p_chave);
  select * into pl from privado.planos where id = p_plano;
  if pl.id is null then
    raise exception 'Plano inválido.' using errcode = 'P0001';
  end if;
  insert into privado.assinaturas (conta_id, recurso, plano_id, ciclo, valor, forma, asaas_id, checkout_id,
                                   proxima_cobranca, sandbox)
  values (p_conta, pl.recurso, pl.id, pl.ciclo, pl.valor, p_forma, nullif(p_asaas_id, ''),
          nullif(p_checkout_id, ''), p_proxima, coalesce(p_sandbox, false))
  returning id into v_id;
  return v_id;
end
$$;

-- cancelar, o Pix e a nota: de qual conta do Asaas é (a cobrança, pela assinatura)
create or replace function public.servidor_pagamento_da_conta(p_chave text, p_conta uuid, p_assinatura uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select jsonb_build_object('id', a.id, 'recurso', a.recurso, 'asaas_id', a.asaas_id, 'situacao', a.situacao,
                                    'forma', a.forma, 'sandbox', a.sandbox)
            from privado.assinaturas a where a.id = p_assinatura and a.conta_id = p_conta);
end
$$;

create or replace function public.servidor_pagamento_cobranca_da_conta(p_chave text, p_conta uuid, p_cobranca uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select jsonb_build_object('id', c.id, 'asaas_id', c.asaas_id, 'situacao', c.situacao, 'forma', c.forma,
                                    'pix_payload', c.pix_payload, 'pix_expira', c.pix_expira,
                                    'sandbox', coalesce((select a.sandbox from privado.assinaturas a
                                                          where a.id = c.assinatura_id), false),
                                    'nota_asaas', (select n.asaas_id from privado.notas_fiscais n
                                                    where n.cobranca_id = c.id and n.situacao = 'autorizada'
                                                    order by n.atualizado_em desc limit 1))
            from privado.cobrancas c where c.id = p_cobranca and c.conta_id = p_conta);
end
$$;

revoke execute on function public.servidor_pagamento_no_sandbox(text, uuid),
  public.servidor_pagamento_cliente(text, uuid, text, text, text, text, boolean),
  public.servidor_pagamento_assinatura(text, uuid, uuid, text, text, text, date, boolean)
  from public;
grant execute on function public.servidor_pagamento_no_sandbox(text, uuid),
  public.servidor_pagamento_cliente(text, uuid, text, text, text, text, boolean),
  public.servidor_pagamento_assinatura(text, uuid, uuid, text, text, text, date, boolean)
  to anon, authenticated, service_role;

-- Admin: o sandbox de cada conta de teste, as assinaturas do sandbox marcadas e fora do "por mês"
create or replace function public.admin_pagamentos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'config', (select to_jsonb(c) - 'id' from privado.config_pagamentos c where c.id),
    'planos', coalesce((select jsonb_agg(to_jsonb(pl) order by pl.recurso, pl.ciclo) from privado.planos pl), '[]'::jsonb),
    'teste', coalesce((select jsonb_agg(jsonb_build_object('conta_id', t.conta_id, 'nome', p.nome,
                                                          'email', u.email, 'sandbox', t.sandbox)
                                        order by t.criado_em desc)
                         from privado.pagamentos_teste t
                         join public.perfis p on p.id = t.conta_id
                         left join auth.users u on u.id = t.conta_id), '[]'::jsonb),
    'assinaturas', coalesce((select jsonb_agg(jsonb_build_object(
                               'id', a.id, 'conta_id', a.conta_id, 'nome', p.nome, 'recurso', a.recurso,
                               'ciclo', a.ciclo, 'valor', a.valor, 'forma', a.forma, 'situacao', a.situacao,
                               'proxima_cobranca', a.proxima_cobranca, 'criada_em', a.criada_em,
                               'sandbox', a.sandbox,
                               'atrasadas', (select count(*) from privado.cobrancas c
                                              where c.assinatura_id = a.id
                                                and c.situacao in ('atrasada', 'recusada')))
                               order by a.criada_em desc)
                              from (select * from privado.assinaturas order by criada_em desc limit 300) a
                              join public.perfis p on p.id = a.conta_id), '[]'::jsonb),
    'por_mes', (select coalesce(sum(a.valor / privado.meses_do_ciclo(a.ciclo)), 0)
                  from privado.assinaturas a where a.situacao = 'ativa' and not a.sandbox),
    'notas_com_erro', coalesce((select jsonb_agg(jsonb_build_object('asaas_id', n.asaas_id, 'erro', n.erro,
                                                                   'nome', p.nome, 'em', n.atualizado_em)
                                                 order by n.atualizado_em desc)
                                  from privado.notas_fiscais n join public.perfis p on p.id = n.conta_id
                                 where n.situacao = 'erro'), '[]'::jsonb),
    'eventos_com_erro', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'erro', e.erro,
                                                                     'em', e.recebido_em) order by e.recebido_em desc)
                                    from (select * from privado.eventos_pagamento
                                           where erro is not null order by recebido_em desc limit 50) e),
                                 '[]'::jsonb)
  )
$$;

-- a conta de teste paga no sandbox (true) ou na produção (false)
create or replace function public.admin_pagamentos_teste_sandbox(p_conta uuid, p_sandbox boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update privado.pagamentos_teste set sandbox = coalesce(p_sandbox, false) where conta_id = p_conta;
  if not found then
    raise exception 'Ponha a conta no teste antes.' using errcode = 'P0001';
  end if;
end
$$;

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
    'contas_sandbox', (select count(*) from privado.pagamentos_teste where sandbox),
    'servico_nota', (select c.servico_nota is not null from privado.config_pagamentos c where c.id),
    'ativas', (select count(*) from privado.assinaturas a where a.situacao = 'ativa' and not a.sandbox)
  )
$$;

revoke execute on function public.admin_pagamentos(), public.admin_pagamentos_teste_sandbox(uuid, boolean),
  public.admin_pagamentos_situacao()
  from public, anon, authenticated;
grant execute on function public.admin_pagamentos(), public.admin_pagamentos_teste_sandbox(uuid, boolean),
  public.admin_pagamentos_situacao()
  to service_role;

notify pgrst, 'reload schema';
