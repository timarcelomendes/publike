-- Admin › Impulsos › Agora com os números do produto de agora (15/11/2026, Marcelo: "Quero que fique tudo aderente").
-- O "Gasto no mês" e o "por curtida" somavam só os impulsos de antes (uma campanha no Google por vaga). Os pacotes de
-- candidatos correm na campanha geral: o robô passa a medir a campanha geral no mês (gasto, cliques, vistas) a cada
-- 2 horas, e o "Atualizar" pede a medida na hora. O custo por candidatura é o gasto da campanha geral no mês dividido
-- pelas candidaturas que os pacotes entregaram no mês.
--
-- Pode rodar de novo.

alter table privado.config_impulso
  add column if not exists geral_mes jsonb,
  add column if not exists geral_mes_em timestamptz;

-- O robô: medir agora? (a cada 2 horas, já se o mês virou ou se o admin pediu)
create or replace function public.servidor_medir_geral(p_chave text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  v_mes text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_impulso where id;
  if c.geral_conta is null or c.geral_campanha_id is null then
    return jsonb_build_object('fazer', false);
  end if;
  return jsonb_build_object(
    'fazer', c.geral_mes_em is null or c.geral_mes_em < now() - interval '2 hours'
             or coalesce(c.geral_mes ->> 'mes', '') <> v_mes,
    'conta', c.geral_conta, 'campanha_id', c.geral_campanha_id, 'mes', v_mes);
end
$$;
revoke execute on function public.servidor_medir_geral(text) from public;
-- o robô usa a chave pública com a chave do servidor (como as outras funções do servidor)
grant execute on function public.servidor_medir_geral(text) to anon, authenticated, service_role;

create or replace function public.servidor_geral_medida(p_chave text, p_medida jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if jsonb_typeof(p_medida) is distinct from 'object' then
    raise exception 'Medida inválida.' using errcode = '22023';
  end if;
  update privado.config_impulso
     set geral_mes = jsonb_build_object(
           'mes', p_medida ->> 'mes',
           'custo', round(coalesce((p_medida ->> 'custo')::numeric, 0), 2),
           'cliques', coalesce((p_medida ->> 'cliques')::integer, 0),
           'vistas', coalesce((p_medida ->> 'vistas')::integer, 0)),
         geral_mes_em = now()
   where id;
end
$$;
revoke execute on function public.servidor_geral_medida(text, jsonb) from public;
grant execute on function public.servidor_geral_medida(text, jsonb) to anon, authenticated, service_role;

-- O "Atualizar": a medida da campanha geral sai na próxima volta do robô (que o botão roda na hora)
create or replace function public.admin_medir_geral_agora()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
begin
  perform privado.exigir_impulsos_admin();
  select * into c from privado.config_impulso where id;
  if c.geral_conta is null or c.geral_campanha_id is null then
    return false;
  end if;
  update privado.config_impulso set geral_mes_em = null where id;
  return true;
end
$$;
revoke execute on function public.admin_medir_geral_agora() from public, anon;
grant execute on function public.admin_medir_geral_agora() to authenticated, service_role;

-- Os números do produto de agora no mês: a campanha geral (do Google) e o que os pacotes entregaram (do banco)
create or replace function public.admin_numeros_da_geral()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_chave text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  c privado.config_impulso;
begin
  perform privado.exigir_impulsos_admin();
  select * into c from privado.config_impulso where id;
  return jsonb_build_object(
    'tem_campanha', c.geral_conta is not null and c.geral_campanha_id is not null,
    -- só vale a medida deste mês
    'geral', case when coalesce(c.geral_mes ->> 'mes', '') = v_chave then c.geral_mes end,
    'medido_em', case when coalesce(c.geral_mes ->> 'mes', '') = v_chave then c.geral_mes_em end,
    'orcamento_dia', c.geral_valor,
    -- as candidaturas que os pacotes entregaram no mês (a curtida continua lá)
    'candidaturas', (select count(*) from privado.impulso_curtidas ic
                       join privado.impulsos i on i.id = ic.impulso_id and i.produto = 'candidatos'
                      where ic.criado_em >= v_mes
                        and exists (select 1 from public.curtidas k
                                     where k.anuncio_id = i.anuncio_id and k.perfil_id = ic.perfil_id)),
    'pacotes_no_mes', (select count(*) from privado.impulsos i
                        where i.produto = 'candidatos'
                          and (i.situacao in ('pago', 'em_revisao', 'no_ar') or i.encerrado_em >= v_mes)),
    'pacotes_pagos', coalesce((select sum(i.valor) from privado.impulsos i
                                where i.produto = 'candidatos' and i.origem = 'compra' and i.criado_em >= v_mes
                                  and i.situacao <> 'devolvido'), 0));
end
$$;
revoke execute on function public.admin_numeros_da_geral() from public, anon;
grant execute on function public.admin_numeros_da_geral() to authenticated, service_role;

notify pgrst, 'reload schema';
