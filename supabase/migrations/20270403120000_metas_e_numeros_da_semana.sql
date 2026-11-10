-- Painel do admin: as metas e os números de segunda por e-mail (claude/plano-indicadores-do-admin.md, parte 5).
-- Pode rodar de novo. Rode depois de 20270402120000_dinheiro_do_admin.sql.
--
-- 1) config_site.metas (indicador → valor) e public.admin_salvar_meta. Começam vazias: quem escolhe é o admin.
-- 2) config_site.numeros_semana (nasce desligado) e public.admin_ligar_numeros_semana.
-- 3) O modelo numeros_da_semana (Admin › E-mails, editável): sai na segunda, a partir das 8h, para quem recebe os
--    avisos da equipe. O site monta o texto (src/lib/admin/numeros-da-semana.ts) com
--    public.servidor_numeros_da_semana e põe na fila com public.servidor_mandar_numeros_da_semana, uma vez por semana.

alter table public.config_site add column if not exists metas jsonb not null default '{}'::jsonb;
alter table public.config_site add column if not exists numeros_semana boolean not null default false;

create table if not exists privado.numeros_semana_enviados (
  semana date primary key,
  enviado_em timestamptz not null default now()
);
alter table privado.numeros_semana_enviados enable row level security;
revoke all on privado.numeros_semana_enviados from public, anon, authenticated;

-- as metas que o Painel conhece (em %, menos vagas novas e encontros, que são por semana)
create or replace function public.admin_salvar_meta(p_indicador text, p_valor numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  if p_indicador not in ('encontros', 'vagas_novas', 'vagas_3_48h', 'de_novo', 'ativos') then
    raise exception 'Indicador sem meta.' using errcode = 'P0001';
  end if;
  if p_valor is not null and (p_valor <= 0 or p_valor > 100000) then
    raise exception 'Confira o valor da meta.' using errcode = 'P0001';
  end if;
  update public.config_site
     set metas = case when p_valor is null then metas - p_indicador
                      else metas || jsonb_build_object(p_indicador, p_valor) end;
end
$$;
revoke execute on function public.admin_salvar_meta(text, numeric) from public, anon, authenticated;
grant execute on function public.admin_salvar_meta(text, numeric) to service_role;

create or replace function public.admin_ligar_numeros_semana(p_ligado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  update public.config_site set numeros_semana = coalesce(p_ligado, false);
end
$$;
revoke execute on function public.admin_ligar_numeros_semana(boolean) from public, anon, authenticated;
grant execute on function public.admin_ligar_numeros_semana(boolean) to service_role;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
values
  ('numeros_da_semana', 'equipe', 40, 'Os números da semana',
   'Para quem recebe os avisos da equipe, na segunda a partir das 8h (ligado no Painel do admin): os números da semana que passou contra a semana antes, com as metas e o que mais mudou.',
   array['periodo', 'numeros', 'mudou', 'link'],
   'Os números do Publike: {{periodo}}',
   E'Os números da semana ({{periodo}}), contra a semana antes:\n\n{{numeros}}\n\n{{mudou}}',
   'Abrir os números',
   'Os números do Publike: {{periodo}}',
   E'Os números da semana ({{periodo}}), contra a semana antes:\n\n{{numeros}}\n\n{{mudou}}',
   'Abrir os números')
on conflict (chave) do nothing;

-- O que o site precisa para montar o e-mail, ou null quando não é hora (desligado, não é segunda depois das 8h, ou
-- esta segunda já saiu). Os números são os da Visão geral de 7 dias, sem a equipe.
create or replace function public.servidor_numeros_da_semana(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  agora timestamp := now() at time zone 'America/Sao_Paulo';
  hoje date := agora::date;
  t_hoje timestamptz := hoje::timestamp at time zone 'America/Sao_Paulo';
  cfg public.config_site;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from public.config_site limit 1;
  if not found or not cfg.numeros_semana or extract(isodow from hoje) <> 1 or agora::time < time '08:00'
     or exists (select 1 from privado.numeros_semana_enviados e where e.semana = hoje) then
    return null;
  end if;
  return jsonb_build_object(
    'semana', hoje,
    'dias', 7,
    'de', hoje - 7,
    'ate', hoje - 1,
    'antes_de', hoje - 14,
    'antes_ate', hoje - 8,
    'com_equipe', false,
    'atual', privado.indicadores_entre(t_hoje - interval '7 days', t_hoje, false) || privado.ativos_entre(hoje - 7, hoje - 1, false),
    'antes', privado.indicadores_entre(t_hoje - interval '14 days', t_hoje - interval '7 days', false)
             || privado.ativos_entre(hoje - 14, hoje - 8, false),
    'metas', cfg.metas
  );
end
$$;
revoke execute on function public.servidor_numeros_da_semana(text) from public;
grant execute on function public.servidor_numeros_da_semana(text) to anon, authenticated, service_role;

-- Põe o e-mail na fila uma vez por segunda (o registro trava a segunda vez). Devolve 1 quando pôs.
create or replace function public.servidor_mandar_numeros_da_semana(p_chave text, p_semana date, p_dados jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.numeros_semana_enviados (semana) values (p_semana) on conflict (semana) do nothing;
  get diagnostics n = row_count;
  if n = 0 then
    return 0;
  end if;
  perform privado.avisar_equipe('numeros_da_semana', coalesce(p_dados, '{}'::jsonb));
  return 1;
end
$$;
revoke execute on function public.servidor_mandar_numeros_da_semana(text, date, jsonb) from public;
grant execute on function public.servidor_mandar_numeros_da_semana(text, date, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
