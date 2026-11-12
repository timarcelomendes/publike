-- Impulsos: os números do Google a cada 2 horas, com os de hoje (12/11/2026).
--
-- Antes, o robô media uma vez por dia, depois das 3h, e só até ontem: no dia em que o impulso entrava no ar, o Admin
-- mostrava R$ 0, 0 vistas e 0 cliques até o dia seguinte. Agora mede a cada 2 horas, até hoje (o dia de hoje vai
-- sendo trocado a cada medida, `servidor_impulso_numeros` substitui o dia). Na mesma medida, o robô passa as
-- campanhas de antes para o lance novo (no alto da página, até R$ 2 por clique; `acertarLance` em impulsos.ts).
--
-- Só muda a condição do "medir" em `servidor_impulsos_para_cuidar` (o resto é igual ao da 20270430120000).

create or replace function public.servidor_impulsos_para_cuidar(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje_3h timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '03:00') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((select jsonb_agg(t) from (
    select jsonb_build_object(
      'id', i.id, 'codigo', i.codigo, 'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'verba', i.verba,
      -- o automático do Publike (o nome da campanha no Google diz de onde o impulso veio)
      'automatico', i.automatico,
      'campanha_id', i.campanha_id, 'grupo_id', i.grupo_id, 'anuncio_google_id', i.anuncio_google_id,
      'conta_google', i.conta_google,
      'texto_simples', i.texto_simples, 'sandbox', i.sandbox, 'ate', i.ate, 'aprovado_em', i.aprovado_em,
      'acao', case
        -- primeiro sai do Google, depois o dinheiro volta
        when i.situacao in ('devolvido', 'credito') and i.campanha_id is not null and not i.campanha_removida then 'remover'
        when i.situacao = 'devolvido' and i.origem = 'compra' and i.estorno_pedido_em is null then 'estornar'
        when i.situacao in ('pago', 'em_revisao', 'no_ar') and i.pausar then 'pausar'
        -- a campanha do cliente acabou antes de o Google aprovar esta vaga
        when i.situacao in ('pago', 'em_revisao') and k.ate is not null and k.ate <= now() then 'encerrar'
        when i.situacao = 'pago' then 'criar'
        when i.situacao = 'em_revisao' then 'olhar'
        when i.situacao = 'no_ar' and i.ate <= now() then 'encerrar'
        else 'medir' end,
      'vaga', case when i.situacao in ('pago', 'em_revisao') then (
        select jsonb_build_object('id', a.id, 'titulo', a.titulo, 'cidade', a.cidade, 'bairro', a.bairro,
                                  'categoria', a.categoria, 'regime', a.regime, 'jornada', a.jornada,
                                  'modelo', a.modelo, 'pagamento_valor', a.pagamento_valor,
                                  'pagamento_ate', a.pagamento_ate, 'pagamento_unidade', a.pagamento_unidade,
                                  'comissao', a.comissao, 'vagas', a.vagas, 'lat', a.geo_lat, 'lng', a.geo_lng,
                                  'cbo', (select f.cbo from privado.funcoes_das_vagas f where f.anuncio_id = a.id),
                                  'raio', privado.raio_da_vaga(a.titulo, a.cidade))
          from public.anuncios a where a.id = i.anuncio_id) end,
      -- a campanha do cliente em que a vaga é um grupo (a conta e a campanha do Google vêm dela)
      'campanha_cliente', case when k.id is not null then
        jsonb_build_object('id', k.id, 'codigo', k.codigo, 'campanha_id', k.campanha_id, 'conta_google', k.conta_google)
        end,
      -- o lugar da vaga ainda não está na campanha do cliente: o grupo acrescenta o ponto dela (arredondado como os
      -- da campanha, para não repetir)
      'novo_lugar', case when k.id is not null and i.situacao = 'pago' then (
        select jsonb_build_object('lat', round(a.geo_lat::numeric, 4), 'lng', round(a.geo_lng::numeric, 4),
                                  'raio', privado.raio_da_vaga(a.titulo, a.cidade))
          from public.anuncios a
         where a.id = i.anuncio_id and a.geo_lat is not null and a.geo_lng is not null
           and not exists (select 1 from jsonb_array_elements(k.lugares) l
                            where (l ->> 'lat')::numeric = round(a.geo_lat::numeric, 4)
                              and (l ->> 'lng')::numeric = round(a.geo_lng::numeric, 4))) end,
      -- medir: do dia em que entrou no ar até hoje
      'medir_desde', ((coalesce(i.aprovado_em, i.no_google_em, i.criado_em)) at time zone 'America/Sao_Paulo')::date,
      'compra', case when i.origem = 'compra' then
        (select jsonb_build_object('asaas_id', c.asaas_id, 'sandbox', c.sandbox, 'valor', c.valor)
           from privado.compras_avulsas c where c.id = i.compra_id) end) as t,
      i.criado_em
    from privado.impulsos i
    left join privado.impulso_campanhas k on k.id = i.campanha_cliente_id
    where (i.proxima_tentativa is null or i.proxima_tentativa <= now())
      and (
        (i.situacao = 'devolvido' and i.origem = 'compra' and i.estorno_pedido_em is null)
        or (i.situacao in ('devolvido', 'credito') and i.campanha_id is not null and not i.campanha_removida)
        or (i.situacao in ('pago', 'em_revisao', 'no_ar') and i.pausar)
        or (i.situacao in ('pago', 'em_revisao') and k.ate is not null and k.ate <= now())
        -- a vaga da campanha do cliente espera a campanha nascer no Google
        or (i.situacao = 'pago' and (k.id is null or k.campanha_id is not null))
        or (i.situacao = 'em_revisao' and (i.olhado_em is null or i.olhado_em < now() - interval '25 minutes'))
        or (i.situacao = 'no_ar' and i.ate <= now())
        -- os números até hoje, a cada 2 horas (antes, os de ontem, uma vez por dia: o Admin mostrava R$ 0 e nenhuma
        -- vista no dia em que o impulso entrava no ar); os do fim, nos 2 dias depois de acabar
        or (i.situacao = 'no_ar' and (i.medido_em is null or i.medido_em < now() - interval '2 hours'))
        or (i.situacao = 'encerrado' and i.encerrado_em > now() - interval '2 days'
            and (i.medido_em is null or i.medido_em < v_hoje_3h) and now() >= v_hoje_3h))
    order by i.criado_em
    limit 25) q), '[]'::jsonb);
end
$$;
