-- Impulsos: a campanha geral do Publike deixa de disputar com o impulso, e o raio novo vale para os que já estão no
-- ar (12/11/2026, claude/plano-impulsionar-vaga.md).
--
-- 1. Sem disputa. No Google, só um anúncio de cada site aparece em cada busca. A campanha geral do Publike ("Quem
--    procura emprego (vagas) - Goiânia", em outra conta do Google Ads) leva o mesmo site e tem mais histórico: ganhava
--    as buscas da função da vaga impulsionada, e os impulsos ficavam com 0 vistas. Agora o robô mantém a lista de
--    palavras negativas "Publike · funções com impulso no ar" (na conta em que ela estiver, ligada à campanha geral)
--    com as funções das vagas no ar: enquanto o impulso corre, a geral não entra nessas buscas; quando acaba, a função
--    sai da lista e a geral volta. Sem a lista no Google, nada muda. Aqui: as vagas no ar e a marca da última vez.
--
-- 2. O raio. O raio do anúncio (Admin › Impulsos: o geral e o de cada tipo de vaga) só valia para o impulso que
--    nascia depois. Agora, na medida (a cada 2 horas), o robô confere o raio da campanha no Google e troca o que
--    mudou; mudar o raio no admin manda medir os impulsos no ar na volta seguinte do robô (em até 5 minutos). Para
--    isso, o impulso no ar passa a vir com a vaga em `servidor_impulsos_para_cuidar` (o resto é igual ao da
--    20270501120000) e, na campanha do cliente, com o ponto da vaga e o maior raio das vagas nele.
--
-- Pode rodar de novo.

-- ------------------------------------------------------------------ 1. sem disputa com a campanha geral

alter table privado.config_impulso
  add column if not exists sem_disputa_assinatura text,
  add column if not exists sem_disputa_em timestamptz;

-- As vagas com impulso no ar (o título e a função da CBO: o robô tira delas as palavras da lista) e a assinatura
-- delas: muda quando um impulso entra no ar, sai ou a vaga muda de título. O robô acerta a lista quando a assinatura
-- muda ou a última vez passou de 1 hora (a lista criada depois ou mexida à mão).
create or replace function public.servidor_impulsos_sem_disputa(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vagas jsonb;
  v_assinatura text;
begin
  perform privado.exigir_servidor(p_chave);
  select coalesce(jsonb_agg(jsonb_build_object('titulo', x.titulo, 'cbo', x.cbo) order by x.id), '[]'::jsonb),
         md5(coalesce(string_agg(x.id::text || '|' || x.titulo || '|' || coalesce(x.cbo, ''), ',' order by x.id), ''))
    into v_vagas, v_assinatura
    from (select i.id, a.titulo, (select f.cbo from privado.funcoes_das_vagas f where f.anuncio_id = a.id) as cbo
            from privado.impulsos i
            join public.anuncios a on a.id = i.anuncio_id
           where i.situacao = 'no_ar' and not i.pausar and (i.ate is null or i.ate > now())) x;
  return jsonb_build_object(
    'vagas', v_vagas,
    'assinatura', v_assinatura,
    'feita', (select c.sem_disputa_assinatura from privado.config_impulso c where c.id),
    'feita_em', (select c.sem_disputa_em from privado.config_impulso c where c.id));
end
$$;

-- a lista foi acertada (ou procurada e não achada, ou deu erro: a próxima tentativa fica para daqui a 1 hora)
create or replace function public.servidor_impulsos_sem_disputa_feita(p_chave text, p_assinatura text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.config_impulso set sem_disputa_assinatura = p_assinatura, sem_disputa_em = now() where id;
end
$$;

-- ------------------------------------------------------------------ 2. o raio nos impulsos no ar

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
      -- a vaga: para criar e olhar o anúncio e, no ar, para conferir o raio (12/11/2026)
      'vaga', case when i.situacao in ('pago', 'em_revisao', 'no_ar') then (
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
      -- na campanha do cliente, o ponto da vaga no ar e o raio que ele deve ter: o maior das vagas que correm nele
      -- (um ponto serve a todas as vagas do mesmo lugar, como na criação da campanha)
      'lugar', case when k.id is not null and i.situacao = 'no_ar' then (
        select jsonb_build_object('lat', round(a.geo_lat::numeric, 4), 'lng', round(a.geo_lng::numeric, 4),
                                  'raio', (select max(privado.raio_da_vaga(b.titulo, b.cidade))
                                             from privado.impulsos j join public.anuncios b on b.id = j.anuncio_id
                                            where j.campanha_cliente_id = k.id
                                              and j.situacao in ('pago', 'em_revisao', 'no_ar')
                                              and round(b.geo_lat::numeric, 4) = round(a.geo_lat::numeric, 4)
                                              and round(b.geo_lng::numeric, 4) = round(a.geo_lng::numeric, 4)))
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
        -- os números até hoje, a cada 2 horas (antes, os de ontem, uma vez por dia: o Admin mostrava R$ 0 e nenhuma
        -- vista no dia em que o impulso entrava no ar); os do fim, nos 2 dias depois de acabar. O raio mudou no
        -- admin: medido_em volta a null (os gatilhos abaixo), e a medida sai na volta seguinte
        or (i.situacao = 'no_ar' and (i.medido_em is null or i.medido_em < now() - interval '2 hours'))
        or (i.situacao = 'encerrado' and i.encerrado_em > now() - interval '2 days'
            and (i.medido_em is null or i.medido_em < v_hoje_3h) and now() >= v_hoje_3h))
    order by i.criado_em
    limit 25) q), '[]'::jsonb);
end
$$;

-- mudou o raio (o geral ou as regras dos tipos de vaga): os impulsos no ar medem na volta seguinte do robô, e a
-- medida troca o raio no Google
create or replace function privado.medir_impulsos_no_ar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update privado.impulsos set medido_em = null where situacao = 'no_ar' and medido_em is not null;
  return null;
end
$$;
revoke execute on function privado.medir_impulsos_no_ar() from public, anon, authenticated;

drop trigger if exists raio_mudou on privado.config_impulso;
create trigger raio_mudou
  after update of raio_capital, raio_outras on privado.config_impulso
  for each row
  when (old.raio_capital is distinct from new.raio_capital or old.raio_outras is distinct from new.raio_outras)
  execute function privado.medir_impulsos_no_ar();

-- nos tipos, o raio e também o que põe a vaga no tipo (as palavras, as de tirar, a ordem): qualquer mudança
drop trigger if exists raio_mudou on privado.tipos_de_vaga;
create trigger raio_mudou
  after insert or update or delete on privado.tipos_de_vaga
  for each statement
  execute function privado.medir_impulsos_no_ar();

-- os impulsos que já estão no ar passam para o raio de hoje na primeira volta do robô depois desta migração
update privado.impulsos set medido_em = null where situacao = 'no_ar';

-- ------------------------------------------------------------------ permissões

-- como as outras do servidor: a chave do servidor (p_chave) é quem protege
revoke execute on function public.servidor_impulsos_sem_disputa(text),
  public.servidor_impulsos_sem_disputa_feita(text, text), public.servidor_impulsos_para_cuidar(text) from public;
grant execute on function public.servidor_impulsos_sem_disputa(text),
  public.servidor_impulsos_sem_disputa_feita(text, text), public.servidor_impulsos_para_cuidar(text)
  to anon, authenticated, service_role;
