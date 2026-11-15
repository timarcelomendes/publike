-- Admin › Impulsos › Agora por período (15/11/2026, Marcelo: "essa informacao deve mostrar ultimos 7 dias, 14dias,
-- ultimos 30 dias (corrente) e ultimo mes de 1 a 30"). O robô passa a guardar a campanha geral dia a dia (do primeiro
-- dia do mês passado até hoje), e a tela soma o período escolhido: o gasto e os cliques no Google, os candidatos que os
-- pacotes entregaram e o que os clientes pagaram.
--
-- Pode rodar de novo.

create table if not exists privado.geral_dias (
  dia date primary key,
  custo numeric(10, 2) not null default 0,
  cliques integer not null default 0,
  vistas integer not null default 0,
  medido_em timestamptz not null default now()
);
alter table privado.geral_dias enable row level security;
revoke all on privado.geral_dias from public, anon, authenticated;

-- O robô: medir agora? E de quando até quando (do primeiro dia do mês passado até hoje, em Brasília).
create or replace function public.servidor_medir_geral(p_chave text)
returns jsonb
language plpgsql
-- volatile: exigir_servidor marca o uso da chave
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_impulso where id;
  if c.geral_conta is null or c.geral_campanha_id is null then
    return jsonb_build_object('fazer', false);
  end if;
  return jsonb_build_object(
    'fazer', c.geral_mes_em is null or c.geral_mes_em < now() - interval '2 hours'
             or coalesce(c.geral_mes ->> 'mes', '') <> v_mes
             -- a primeira vez com os dias: mede já
             or not exists (select 1 from privado.geral_dias),
    'conta', c.geral_conta, 'campanha_id', c.geral_campanha_id, 'mes', v_mes,
    'desde', to_char(date_trunc('month', hoje) - interval '1 month', 'YYYY-MM-DD'),
    'ate', to_char(hoje, 'YYYY-MM-DD'));
end
$$;
revoke execute on function public.servidor_medir_geral(text) from public;
grant execute on function public.servidor_medir_geral(text) to anon, authenticated, service_role;

-- O robô guarda: os dias (`dias`: [{dia, custo, cliques, vistas}]) e a soma do mês (como antes)
create or replace function public.servidor_geral_medida(p_chave text, p_medida jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  if jsonb_typeof(p_medida) is distinct from 'object' then
    raise exception 'Medida inválida.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_medida -> 'dias') = 'array' then
    for d in select * from jsonb_array_elements(p_medida -> 'dias') loop
      if (d ->> 'dia') ~ '^\d{4}-\d{2}-\d{2}$' then
        insert into privado.geral_dias (dia, custo, cliques, vistas, medido_em)
        values ((d ->> 'dia')::date, round(coalesce((d ->> 'custo')::numeric, 0), 2),
                coalesce((d ->> 'cliques')::integer, 0), coalesce((d ->> 'vistas')::integer, 0), now())
        on conflict (dia) do update
          set custo = excluded.custo, cliques = excluded.cliques, vistas = excluded.vistas, medido_em = now();
      end if;
    end loop;
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

-- Os números do período (de `p_de` a `p_ate`, os dois incluídos, em Brasília; sem eles, o mês corrente)
drop function if exists public.admin_numeros_da_geral();
create or replace function public.admin_numeros_da_geral(p_de date default null, p_ate date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  de date := coalesce(p_de, date_trunc('month', hoje)::date);
  ate date := least(coalesce(p_ate, hoje), hoje);
  ini timestamptz := de::timestamp at time zone 'America/Sao_Paulo';
  fim timestamptz := (ate + 1)::timestamp at time zone 'America/Sao_Paulo';
  c privado.config_impulso;
begin
  perform privado.exigir_impulsos_admin();
  select * into c from privado.config_impulso where id;
  return jsonb_build_object(
    'tem_campanha', c.geral_conta is not null and c.geral_campanha_id is not null,
    'de', de, 'ate', ate,
    'geral', (select case when count(*) = 0 then null else jsonb_build_object(
                'custo', coalesce(sum(g.custo), 0), 'cliques', coalesce(sum(g.cliques), 0),
                'vistas', coalesce(sum(g.vistas), 0), 'dias', count(*)) end
                from privado.geral_dias g where g.dia between de and ate),
    'medido_em', (select max(g.medido_em) from privado.geral_dias g),
    'orcamento_dia', c.geral_valor,
    -- as candidaturas que os pacotes entregaram no período (a curtida continua lá)
    'candidaturas', (select count(*) from privado.impulso_curtidas ic
                       join privado.impulsos i on i.id = ic.impulso_id and i.produto = 'candidatos'
                      where ic.criado_em >= ini and ic.criado_em < fim
                        and exists (select 1 from public.curtidas k
                                     where k.anuncio_id = i.anuncio_id and k.perfil_id = ic.perfil_id)),
    'pacotes_no_mes', (select count(*) from privado.impulsos i
                        where i.produto = 'candidatos' and i.criado_em < fim
                          and (i.situacao in ('pago', 'em_revisao', 'no_ar') or i.encerrado_em >= ini)),
    'pacotes_pagos', coalesce((select sum(i.valor) from privado.impulsos i
                                where i.produto = 'candidatos' and i.origem = 'compra'
                                  and i.criado_em >= ini and i.criado_em < fim and i.situacao <> 'devolvido'), 0));
end
$$;
revoke execute on function public.admin_numeros_da_geral(date, date) from public, anon;
grant execute on function public.admin_numeros_da_geral(date, date) to authenticated, service_role;

notify pgrst, 'reload schema';
