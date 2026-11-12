-- Cada impulso lembra a conta do Google Ads em que nasceu (12/11/2026). O Marcelo separou os impulsos numa conta
-- própria (Publike Impulsos, abaixo da conta de administrador Publike); um impulso tinha nascido na conta antiga
-- (publike.org) antes da troca na Vercel. O robô montava o endereço da campanha com a conta da variável de hoje e não
-- acharia a campanha antiga para olhar a revisão, medir e encerrar. Agora a conta fica gravada na criação; a dos
-- impulsos de antes o robô descobre sozinho entre as contas que o acesso enxerga e grava
-- (servidor_impulso_conta). Pode rodar de novo.

alter table privado.impulsos
  add column if not exists conta_google text check (conta_google is null or conta_google ~ '^[0-9]{10}$');

create or replace function public.servidor_impulsos_para_cuidar(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg privado.config_impulso;
  v_hoje_3h timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '03:00') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_impulso where id;
  return coalesce((select jsonb_agg(t) from (
    select jsonb_build_object(
      'id', i.id, 'codigo', i.codigo, 'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'verba', i.verba,
      'campanha_id', i.campanha_id, 'grupo_id', i.grupo_id, 'anuncio_google_id', i.anuncio_google_id,
      'conta_google', i.conta_google,
      'texto_simples', i.texto_simples, 'sandbox', i.sandbox, 'ate', i.ate, 'aprovado_em', i.aprovado_em,
      'acao', case
        -- primeiro sai do Google, depois o dinheiro volta
        when i.situacao in ('devolvido', 'credito') and i.campanha_id is not null and not i.campanha_removida then 'remover'
        when i.situacao = 'devolvido' and i.origem = 'compra' and i.estorno_pedido_em is null then 'estornar'
        when i.situacao in ('pago', 'em_revisao', 'no_ar') and i.pausar then 'pausar'
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
                                  'raio', case when a.cidade = 'Goiânia' then cfg.raio_capital else cfg.raio_outras end)
          from public.anuncios a where a.id = i.anuncio_id) end,
      -- medir: do dia em que entrou no ar até ontem (ou hoje, no fim)
      'medir_desde', ((coalesce(i.aprovado_em, i.no_google_em, i.criado_em)) at time zone 'America/Sao_Paulo')::date,
      'compra', case when i.origem = 'compra' then
        (select jsonb_build_object('asaas_id', k.asaas_id, 'sandbox', k.sandbox, 'valor', k.valor)
           from privado.compras_avulsas k where k.id = i.compra_id) end) as t,
      i.criado_em
    from privado.impulsos i
    where (i.proxima_tentativa is null or i.proxima_tentativa <= now())
      and (
        (i.situacao = 'devolvido' and i.origem = 'compra' and i.estorno_pedido_em is null)
        or (i.situacao in ('devolvido', 'credito') and i.campanha_id is not null and not i.campanha_removida)
        or (i.situacao in ('pago', 'em_revisao', 'no_ar') and i.pausar)
        or i.situacao = 'pago'
        or (i.situacao = 'em_revisao' and (i.olhado_em is null or i.olhado_em < now() - interval '25 minutes'))
        or (i.situacao = 'no_ar' and i.ate <= now())
        -- os números de ontem, uma vez por dia depois das 3h (e os do fim, nos 2 dias depois de acabar)
        or (i.situacao = 'no_ar' and (i.medido_em is null or i.medido_em < v_hoje_3h) and now() >= v_hoje_3h)
        or (i.situacao = 'encerrado' and i.encerrado_em > now() - interval '2 days'
            and (i.medido_em is null or i.medido_em < v_hoje_3h) and now() >= v_hoje_3h))
    order by i.criado_em
    limit 25) q), '[]'::jsonb);
end
$$;

create or replace function public.servidor_impulso_criado(p_chave text, p_id uuid, p_ids jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
begin
  perform privado.exigir_servidor(p_chave);
  select * into i from privado.impulsos where id = p_id for update;
  if i.id is null then
    return jsonb_build_object('remover', true);
  end if;
  update privado.impulsos
     set campanha_id = p_ids ->> 'campanha', orcamento_id = p_ids ->> 'orcamento', grupo_id = p_ids ->> 'grupo',
         anuncio_google_id = p_ids ->> 'anuncio', no_google_em = now(),
         conta_google = coalesce(nullif(regexp_replace(coalesce(p_ids ->> 'conta', ''), '\D', '', 'g'), ''), conta_google),
         situacao = case when situacao = 'pago' and not pausar then 'em_revisao' else situacao end,
         tentativas = 0, proxima_tentativa = null, ultimo_erro = null, erro_desde = null, olhado_em = null
   where id = p_id;
  return jsonb_build_object('remover', i.situacao <> 'pago' or i.pausar);
end
$$;

-- a conta que o robô achou para um impulso de antes (só grava se ainda não tinha)
create or replace function public.servidor_impulso_conta(p_chave text, p_id uuid, p_conta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := regexp_replace(coalesce(p_conta, ''), '\D', '', 'g');
begin
  perform privado.exigir_servidor(p_chave);
  if v !~ '^[0-9]{10}$' then
    raise exception 'Conta do Google Ads inválida.' using errcode = '22023';
  end if;
  update privado.impulsos set conta_google = v where id = p_id and conta_google is null;
end
$$;

-- como as outras do servidor: a chave do servidor (p_chave) é quem protege
revoke execute on function public.servidor_impulso_conta(text, uuid, text) from public;
grant execute on function public.servidor_impulso_conta(text, uuid, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
