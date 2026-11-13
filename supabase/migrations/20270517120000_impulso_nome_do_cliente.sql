-- O nome do cliente na tarefa do robô do impulso (13/11/2026, Marcelo: "pense e organize como serão as campanhas,
-- grupos e anúncios, para ficar organizado"). A campanha no Google passa a dizer o cliente, o tipo e a vaga:
-- "Impulso · Padaria Boa · Pago 7 dias · Padeiro · 8da58639ff" (src/lib/impulso-nomes.ts); as que estão no ar ganham o
-- nome novo na medida seguinte. Só acrescenta "cliente" a servidor_impulsos_para_cuidar (o resto é o de
-- 20270509120000). Sem esta migração, a campanha nova sai com "Sem nome" no lugar do cliente e as do ar ficam com o
-- nome de antes. Pode rodar de novo.

create or replace function public.servidor_impulsos_para_cuidar(p_chave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_hoje_3h timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '03:00') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((select jsonb_agg(t) from (
    select jsonb_build_object(
      'id', i.id, 'codigo', i.codigo, 'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'verba', i.verba,
      -- o automático do Publike (o nome da campanha no Google diz de onde o impulso veio)
      'automatico', i.automatico,
      -- o nome do cliente, para o nome da campanha no Google (13/11/2026, lib/impulso-nomes.ts)
      'cliente', (select left(p.nome, 60) from public.perfis p where p.id = i.conta_id),
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
      -- a vaga: para criar e olhar o anúncio e, no ar, para conferir o raio (12/11/2026), com o raio a mais do ajuste
      'vaga', case when i.situacao in ('pago', 'em_revisao', 'no_ar') then (
        select jsonb_build_object('id', a.id, 'titulo', a.titulo, 'cidade', a.cidade, 'bairro', a.bairro,
                                  'categoria', a.categoria, 'regime', a.regime, 'jornada', a.jornada,
                                  'modelo', a.modelo, 'pagamento_valor', a.pagamento_valor,
                                  'pagamento_ate', a.pagamento_ate, 'pagamento_unidade', a.pagamento_unidade,
                                  'comissao', a.comissao, 'vagas', a.vagas, 'lat', a.geo_lat, 'lng', a.geo_lng,
                                  'cbo', (select f.cbo from privado.funcoes_das_vagas f where f.anuncio_id = a.id),
                                  'raio', least(privado.raio_da_vaga(a.titulo, a.cidade) + i.raio_extra, 65))
          from public.anuncios a where a.id = i.anuncio_id) end,
      -- as buscas que a IA tirou do grupo da vaga (negativas exatas, 13/11/2026)
      'excluidas', case when i.situacao in ('pago', 'em_revisao', 'no_ar') then to_jsonb(i.buscas_excluidas) end,
      -- a campanha do cliente em que a vaga é um grupo (a conta e a campanha do Google vêm dela)
      'campanha_cliente', case when k.id is not null then
        jsonb_build_object('id', k.id, 'codigo', k.codigo, 'campanha_id', k.campanha_id, 'conta_google', k.conta_google)
        end,
      -- o lugar da vaga ainda não está na campanha do cliente: o grupo acrescenta o ponto dela (arredondado como os
      -- da campanha, para não repetir)
      'novo_lugar', case when k.id is not null and i.situacao = 'pago' then (
        select jsonb_build_object('lat', round(a.geo_lat::numeric, 4), 'lng', round(a.geo_lng::numeric, 4),
                                  'raio', least(privado.raio_da_vaga(a.titulo, a.cidade) + k.raio_extra, 65))
          from public.anuncios a
         where a.id = i.anuncio_id and a.geo_lat is not null and a.geo_lng is not null
           and not exists (select 1 from jsonb_array_elements(k.lugares) l
                            where (l ->> 'lat')::numeric = round(a.geo_lat::numeric, 4)
                              and (l ->> 'lng')::numeric = round(a.geo_lng::numeric, 4))) end,
      -- na campanha do cliente, o ponto da vaga no ar e o raio que ele deve ter: o maior das vagas que correm nele
      -- (um ponto serve a todas as vagas do mesmo lugar, como na criação da campanha), mais o raio a mais do ajuste
      'lugar', case when k.id is not null and i.situacao = 'no_ar' then (
        select jsonb_build_object('lat', round(a.geo_lat::numeric, 4), 'lng', round(a.geo_lng::numeric, 4),
                                  'raio', least((select max(privado.raio_da_vaga(b.titulo, b.cidade))
                                                   from privado.impulsos j join public.anuncios b on b.id = j.anuncio_id
                                                  where j.campanha_cliente_id = k.id
                                                    and j.situacao in ('pago', 'em_revisao', 'no_ar')
                                                    and round(b.geo_lat::numeric, 4) = round(a.geo_lat::numeric, 4)
                                                    and round(b.geo_lng::numeric, 4) = round(a.geo_lng::numeric, 4))
                                                + k.raio_extra, 65))
          from public.anuncios a
         where a.id = i.anuncio_id and a.geo_lat is not null and a.geo_lng is not null) end,
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
        -- os números até hoje, a cada 2 horas; o raio mudou no admin (ou no ajuste): medido_em volta a null, e a
        -- medida sai na volta seguinte
        or (i.situacao = 'no_ar' and (i.medido_em is null or i.medido_em < now() - interval '2 hours'))
        or (i.situacao = 'encerrado' and i.encerrado_em > now() - interval '2 days'
            and (i.medido_em is null or i.medido_em < v_hoje_3h) and now() >= v_hoje_3h))
    order by i.criado_em
    limit 25) q), '[]'::jsonb);
end
$function$
;

notify pgrst, 'reload schema';
