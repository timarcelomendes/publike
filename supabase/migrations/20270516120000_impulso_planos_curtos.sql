-- Os planos do impulso com ao menos R$ 10 por dia no Google e o "Rápido" (13/11/2026). Pedidos do Marcelo: "menos de
-- R$ 10,00 por dia não vale a pena"; "a empresa pode querer mais pessoas em menos tempo, talvez uma opção para 3 dias";
-- "dar opção de reduzir dias com mais volume e o mesmo preço"; "o de 3 continua"; "o 15 não sai"; 7 dias a R$ 94,90.
-- Com R$ 4 por dia, as campanhas ficaram com 0 vistas; com o clique a uns R$ 1,25, R$ 10 por dia trazem umas 8 pessoas
-- por dia.
--   3 dias: R$ 49, R$ 30 no Google.
--   7 dias: R$ 94,90, R$ 70 no Google; ou Rápido, os mesmos R$ 70 em 3 dias (uns R$ 23 por dia).
--   15 dias: R$ 189, R$ 150 no Google; ou Rápido, os mesmos R$ 150 em 7 dias (uns R$ 21 por dia).
--   O impulso grátis e o automático: 3 dias, R$ 30.
-- precos_impulso.dias_rapido: os dias do Rápido (null: o plano não tem). A compra no Rápido guarda esses dias, com o
-- preço e a verba do plano (servidor_compra_impulso, p_rapido). Admin › Impulsos › Regras passa a recusar menos de
-- R$ 10 por dia (src/lib/acoes/admin-impulsos.ts). Pode rodar de novo.

alter table privado.precos_impulso add column if not exists dias_rapido smallint;
alter table privado.precos_impulso drop constraint if exists precos_impulso_dias_rapido_check;
alter table privado.precos_impulso add constraint precos_impulso_dias_rapido_check
  check (dias_rapido is null or (dias_rapido >= 1 and dias_rapido < dias));

insert into privado.precos_impulso (dias, valor, verba, ligado, dias_rapido) values
  (3, 49.00, 30.00, true, null), (7, 94.90, 70.00, true, 3), (15, 189.00, 150.00, true, 7)
on conflict (dias) do update
  set valor = excluded.valor, verba = excluded.verba, ligado = true, dias_rapido = excluded.dias_rapido;

update privado.config_impulso set cortesia_dias = 3, cortesia_verba = 30, auto_dias = 3, auto_verba = 30;

-- a página do impulso da vaga: os planos com os dias do Rápido (o resto é o de 20270509120000)
create or replace function public.impulso_da_vaga(p_anuncio uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  conta uuid := public.conta_atual();
  a public.anuncios;
begin
  if (select auth.uid()) is null or conta is null then
    return null;
  end if;
  select * into a from public.anuncios where id = p_anuncio and autor_id = conta and tipo = 'vaga';
  if a.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'vaga', jsonb_build_object('id', a.id, 'titulo', a.titulo, 'cidade', a.cidade, 'bairro', a.bairro,
                               'status', a.status, 'preenchida', a.preenchida_em is not null,
                               'pagamento_valor', a.pagamento_valor, 'pagamento_ate', a.pagamento_ate,
                               'pagamento_unidade', a.pagamento_unidade, 'regime', a.regime, 'jornada', a.jornada),
    'motivo', privado.impulso_motivo_vaga(conta, a.id),
    'pode_pagar', privado.pode_pagar(conta),
    'precos', coalesce((select jsonb_agg(jsonb_build_object('dias', p.dias, 'valor', p.valor, 'verba', p.verba, 'dias_rapido', p.dias_rapido)
                                         order by p.dias)
                          from privado.precos_impulso p where p.ligado), '[]'::jsonb),
    'credito', privado.dias_de_credito(conta),
    'cortesia', case when privado.impulso_cortesia_disponivel(conta, a.id)
                     then (select jsonb_build_object('dias', c.cortesia_dias) from privado.config_impulso c where c.id) end,
    'raio', privado.raio_da_vaga(a.titulo, a.cidade),
    'ajuste_ligado', coalesce((select c.motor_ligado from privado.config_impulso c where c.id), false),
    -- na campanha do cliente, a verba é uma só para as vagas dele: o cliente vê a da campanha e quantas vagas ela tem
    'impulsos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'valor', i.valor,
        'verba', coalesce(k.verba, i.verba),
        'gasto', case when k.id is not null
                      then least((select coalesce(sum(x.gasto), 0) from privado.impulsos x where x.campanha_cliente_id = k.id),
                                 k.verba)
                      else least(i.gasto, i.verba) end,
        'campanha_vagas', case when k.id is not null
                               then (select count(*) from privado.impulsos x where x.campanha_cliente_id = k.id) end,
        'motivo', i.motivo, 'criado_em', i.criado_em, 'aprovado_em', i.aprovado_em,
        'ate', i.ate, 'encerrado_em', i.encerrado_em, 'pausar', i.pausar,
        'totais', (select jsonb_build_object('impressoes', coalesce(sum(d.impressoes), 0),
                                             'cliques', coalesce(sum(d.cliques), 0),
                                             'visitas', coalesce(sum(d.visitas), 0),
                                             'curtidas', coalesce(sum(d.curtidas), 0))
                     from privado.impulso_dias d where d.impulso_id = i.id),
        'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', d.dia, 'impressoes', d.impressoes,
                                                                 'cliques', d.cliques, 'visitas', d.visitas,
                                                                 'curtidas', d.curtidas) order by d.dia)
                               from privado.impulso_dias d where d.impulso_id = i.id), '[]'::jsonb),
        -- o ajuste diário (beta): as manhãs com o que mudou, as mais novas primeiro
        'ajustes', coalesce((select jsonb_agg(jsonb_build_object('dia', j.dia, 'mudancas', j.mudancas) order by j.dia desc)
                               from (select z.dia,
                                            (select coalesce(jsonb_agg(m), '[]'::jsonb) from jsonb_array_elements(z.mudancas) m
                                              where m ->> 'impulso_id' is null or m ->> 'impulso_id' = i.id::text) as mudancas
                                       from privado.impulso_ajustes z
                                      where z.erro is null
                                        and (z.impulso_id = i.id
                                             or (i.campanha_cliente_id is not null
                                                 and z.campanha_cliente_id = i.campanha_cliente_id))
                                      order by z.dia desc limit 20) j), '[]'::jsonb))
        order by i.criado_em desc)
      from privado.impulsos i
      left join privado.impulso_campanhas k on k.id = i.campanha_cliente_id
     where i.anuncio_id = a.id and i.conta_id = conta), '[]'::jsonb),
    -- a compra paga esperando virar impulso (o aviso do pagamento chega em segundos) ou o Pix gerado
    'compra_pendente', (select jsonb_build_object('id', k.id, 'situacao', k.situacao, 'dias', k.dias,
                                                  'cobranca', (select c.id from privado.cobrancas c where c.compra_id = k.id
                                                                order by c.criada_em desc limit 1))
                          from privado.compras_avulsas k
                         where k.anuncio_id = a.id and k.conta_id = conta and k.tipo = 'impulso'
                           and k.situacao = 'pendente' and k.asaas_id is not null
                           and k.criada_em > now() - interval '1 day'
                         order by k.criada_em desc limit 1));
end
$function$
;


-- a compra: no Rápido, os dias dele, com o preço e a verba do plano
drop function if exists public.servidor_compra_impulso(text, uuid, uuid, integer, text, boolean);
create or replace function public.servidor_compra_impulso(p_chave text, p_conta uuid, p_anuncio uuid, p_dias integer,
                                                          p_forma text, p_sandbox boolean, p_rapido boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr privado.precos_impulso;
  v_motivo text;
  v_id uuid;
  v_dias smallint;
begin
  perform privado.exigir_servidor(p_chave);
  if not privado.pode_pagar(p_conta) then
    return jsonb_build_object('erro', 'Os pagamentos ainda não estão abertos para a sua conta.');
  end if;
  if p_forma not in ('cartao', 'pix') then
    return jsonb_build_object('erro', 'Escolha cartão ou Pix.');
  end if;
  v_motivo := privado.impulso_motivo_vaga(p_conta, p_anuncio);
  if v_motivo is not null then
    return jsonb_build_object('erro', v_motivo);
  end if;
  select * into pr from privado.precos_impulso where dias = p_dias and ligado;
  if pr.dias is null or (coalesce(p_rapido, false) and pr.dias_rapido is null) then
    return jsonb_build_object('erro', 'Esse impulso não está à venda. Atualize a página.');
  end if;
  v_dias := case when coalesce(p_rapido, false) then pr.dias_rapido else pr.dias end;
  insert into privado.compras_avulsas (conta_id, tipo, recurso, valor, forma, dias, anuncio_id, verba, sandbox)
  values (p_conta, 'impulso', 'impulso', pr.valor, p_forma, v_dias, p_anuncio, pr.verba, coalesce(p_sandbox, false))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'valor', pr.valor, 'dias', v_dias, 'rapido', coalesce(p_rapido, false),
                            'titulo', (select a.titulo from public.anuncios a where a.id = p_anuncio));
end
$$;

revoke execute on function public.servidor_compra_impulso(text, uuid, uuid, integer, text, boolean, boolean) from public;
grant execute on function public.servidor_compra_impulso(text, uuid, uuid, integer, text, boolean, boolean)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
