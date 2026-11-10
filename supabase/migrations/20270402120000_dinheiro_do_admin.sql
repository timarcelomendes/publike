-- Painel do admin › Dinheiro (claude/plano-indicadores-do-admin.md, parte 4). Pode rodar de novo.
-- Rode depois de 20270401120000_indicadores_historico.sql.
--
-- 1) public.admin_dinheiro(dias): sem o sandbox (assinatura marcada sandbox ou conta de teste no sandbox), a receita
--    por mês, as assinaturas ativas por recurso, as novas e as canceladas no período, as cobranças em atraso, o
--    recebido no período, os 15 dias grátis começados e quantos viraram assinatura em até 30 dias depois do fim, e o
--    uso dos recursos pagos (leituras da Triagem, testes feitos, entrevistas em vídeo, ao vivo e regras ligadas).
-- 2) privado.gastos_divulgacao: o gasto com anúncios por mês e por canal, digitado no Painel (admin_salvar_gasto),
--    para o custo por conta nova. Só totais.

create table if not exists privado.gastos_divulgacao (
  mes date not null check (extract(day from mes) = 1),
  canal text not null check (char_length(canal) between 2 and 40),
  valor numeric(12, 2) not null check (valor >= 0 and valor <= 1000000),
  atualizado_em timestamptz not null default now(),
  primary key (mes, canal)
);
alter table privado.gastos_divulgacao enable row level security;
revoke all on privado.gastos_divulgacao from public, anon, authenticated;

create or replace function public.admin_salvar_gasto(p_mes date, p_canal text, p_valor numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  if p_valor is null or p_valor = 0 then
    delete from privado.gastos_divulgacao g where g.mes = date_trunc('month', p_mes)::date and g.canal = trim(p_canal);
    return;
  end if;
  insert into privado.gastos_divulgacao (mes, canal, valor, atualizado_em)
  values (date_trunc('month', p_mes)::date, trim(p_canal), p_valor, now())
  on conflict (mes, canal) do update set valor = excluded.valor, atualizado_em = now();
end
$$;
revoke execute on function public.admin_salvar_gasto(date, text, numeric) from public, anon, authenticated;
grant execute on function public.admin_salvar_gasto(date, text, numeric) to service_role;

create or replace function public.admin_dinheiro(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dias integer := case when p_dias in (7, 30, 90) then p_dias else 30 end;
  ini timestamptz := now() - make_interval(days => dias);
  v jsonb;
begin
  perform privado.exigir_admin();
  with
  teste as (select t.conta_id from privado.pagamentos_teste t where t.sandbox),
  assin as (
    select a.* from privado.assinaturas a
     where not coalesce(a.sandbox, false) and a.conta_id not in (select conta_id from teste)
  ),
  cobr as (
    select c.* from privado.cobrancas c
      left join privado.assinaturas a on a.id = c.assinatura_id
     where not coalesce(a.sandbox, false) and c.conta_id not in (select conta_id from teste)
  ),
  exp as (
    select e.*,
           exists (select 1 from assin a
                    where a.conta_id = e.conta_id and a.situacao in ('ativa', 'cancelada')
                      and a.criada_em >= e.inicio and a.criada_em <= e.fim + interval '30 days') as assinou
      from privado.experimentos e
     where e.inicio >= ini and e.conta_id not in (select conta_id from teste)
  )
  select jsonb_build_object(
    'dias', dias,
    'por_mes', (select coalesce(sum(a.valor / privado.meses_do_ciclo(a.ciclo)), 0) from assin a where a.situacao = 'ativa'),
    'ativas', (select count(*) from assin a where a.situacao = 'ativa'),
    'por_recurso', coalesce((select jsonb_agg(jsonb_build_object('recurso', x.recurso, 'ativas', x.n, 'por_mes', x.por_mes)
                                              order by x.n desc)
                               from (select a.recurso, count(*) as n,
                                            sum(a.valor / privado.meses_do_ciclo(a.ciclo)) as por_mes
                                       from assin a where a.situacao = 'ativa' group by a.recurso) x), '[]'::jsonb),
    'novas', (select count(*) from assin a where a.criada_em >= ini and a.situacao in ('ativa', 'cancelada')),
    'canceladas', (select count(*) from assin a where a.cancelada_em >= ini),
    'em_atraso', (select count(*) from cobr c where c.situacao = 'atrasada'),
    'recebido', (select coalesce(sum(c.valor), 0) from cobr c where c.situacao = 'paga' and c.pago_em >= ini),
    'cobrancas_pagas', (select count(*) from cobr c where c.situacao = 'paga' and c.pago_em >= ini),
    'gratis_comecados', (select count(*) from exp),
    'gratis_acabados', (select count(*) from exp where exp.fim < now()),
    'gratis_assinaram', (select count(*) from exp where exp.assinou),
    'uso', jsonb_build_object(
      'leituras_triagem', (select count(*) from privado.copiloto_avaliacoes x where x.criado_em >= ini),
      'testes_feitos', (select count(*) from privado.avaliacoes_pedidas x where x.feita_em >= ini),
      'videos_enviados', (select count(*) from public.entrevistas_video x where x.enviada_em >= ini),
      'ao_vivo', (select count(*) from public.entrevistas x where x.formato = 'publike' and x.criado_em >= ini
                    and x.situacao <> 'cancelada'),
      'regras_ligadas', (select count(*) from public.regras x where x.ligada)
    ),
    'gastos', coalesce((select jsonb_agg(jsonb_build_object('mes', g.mes, 'canal', g.canal, 'valor', g.valor)
                                         order by g.mes desc, g.canal)
                          from privado.gastos_divulgacao g where g.mes >= date_trunc('month', now() - interval '3 months')),
                       '[]'::jsonb)
  ) into v;
  return v;
end
$$;
revoke execute on function public.admin_dinheiro(integer) from public, anon, authenticated;
grant execute on function public.admin_dinheiro(integer) to service_role;

notify pgrst, 'reload schema';
