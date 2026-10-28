-- Quem está on-line e quem voltou (27/10/2026), no Painel do admin e no /equipe. Pode rodar de novo.
-- 1) On-line agora: pessoas (com ou sem conta) que abriram ou trocaram de página nos últimos 5 minutos. O
--    acesso do dia (privado.acessos_site, que não guarda quem é) ganha a hora da última página (visto_em):
--    a página aberta inteira marca por contar_acesso; a troca de página dentro do site, por marcar_online
--    (o proxy chama no máximo a cada 2 minutos por pessoa).
-- 2) Voltaram: as contas que entraram em cada dia (privado.contas_ativas, só conta e dia). "Voltaram hoje"
--    são as que entraram hoje e foram criadas antes de hoje; em 7 dias, as que entraram em 2 dias ou mais.
--    Sem conta não dá para saber quem voltou: o acesso do dia muda de código todo dia, de propósito.

alter table privado.acessos_site add column if not exists visto_em timestamptz;

create table if not exists privado.contas_ativas (
  dia date not null,
  conta_id uuid not null references auth.users (id) on delete cascade,
  primary key (dia, conta_id)
);
alter table privado.contas_ativas enable row level security;
create index if not exists contas_ativas_conta_idx on privado.contas_ativas (conta_id, dia);

-- a de 20261114120000, mais a hora da última página e a conta do dia
create or replace function public.contar_acesso(p_ip text, p_navegador text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  agora timestamp := now() at time zone 'America/Sao_Paulo';
  hoje date := agora::date;
  s text;
begin
  if coalesce(p_ip, '') = '' or length(p_ip) > 64 then
    return;
  end if;
  select a.sorteio into s from privado.sorteio_acessos a where a.dia = hoje;
  if s is null then
    insert into privado.sorteio_acessos (dia) values (hoje) on conflict (dia) do nothing;
    select a.sorteio into s from privado.sorteio_acessos a where a.dia = hoje;
    -- o sorteio de ontem para trás não serve mais: sem ele, ninguém liga o código à pessoa
    delete from privado.sorteio_acessos a where a.dia < hoje;
  end if;
  -- trava contra enxurrada: um dia normal fica muito abaixo disso
  if (select count(*) from privado.acessos_site a where a.dia = hoje) >= 200000 then
    return;
  end if;
  insert into privado.acessos_site as a (dia, visitante, com_conta, hora, visto_em)
  values (hoje,
          sha256(convert_to(s || '|' || p_ip || '|' || left(coalesce(p_navegador, ''), 300), 'UTF8')),
          (select auth.uid()) is not null,
          extract(hour from agora)::smallint,
          now())
  on conflict (dia, visitante) do update
    set paginas = a.paginas + 1,
        com_conta = a.com_conta or excluded.com_conta,
        visto_em = now();
  if (select auth.uid()) is not null then
    insert into privado.contas_ativas (dia, conta_id) values (hoje, (select auth.uid())) on conflict do nothing;
  end if;
end
$$;
revoke execute on function public.contar_acesso(text, text) from public;
grant execute on function public.contar_acesso(text, text) to anon, authenticated;

-- a troca de página dentro do site: só marca a hora (não conta página nem pessoa nova)
create or replace function public.marcar_online(p_ip text, p_navegador text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  s text;
begin
  if coalesce(p_ip, '') = '' or length(p_ip) > 64 then
    return;
  end if;
  select a.sorteio into s from privado.sorteio_acessos a where a.dia = hoje;
  if s is not null then
    update privado.acessos_site a
       set visto_em = now(),
           com_conta = a.com_conta or (select auth.uid()) is not null
     where a.dia = hoje
       and a.visitante = sha256(convert_to(s || '|' || p_ip || '|' || left(coalesce(p_navegador, ''), 300), 'UTF8'));
  end if;
  if (select auth.uid()) is not null then
    insert into privado.contas_ativas (dia, conta_id) values (hoje, (select auth.uid())) on conflict do nothing;
  end if;
end
$$;
revoke execute on function public.marcar_online(text, text) from public;
grant execute on function public.marcar_online(text, text) to anon, authenticated;

-- os números: on-line agora, contas de hoje, as que voltaram hoje e em 7 dias
create or replace function public.admin_presenca()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  inicio_de_hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_admin();
  return jsonb_build_object(
    'online', (select count(*) from privado.acessos_site a
                where a.dia = hoje and a.visto_em >= now() - interval '5 minutes'),
    'online_com_conta', (select count(*) from privado.acessos_site a
                          where a.dia = hoje and a.com_conta and a.visto_em >= now() - interval '5 minutes'),
    'contas_hoje', (select count(*) from privado.contas_ativas c where c.dia = hoje),
    'voltaram_hoje', (select count(*) from privado.contas_ativas c
                        join auth.users u on u.id = c.conta_id
                       where c.dia = hoje and u.created_at < inicio_de_hoje),
    'contas_7d', (select count(distinct c.conta_id) from privado.contas_ativas c where c.dia > hoje - 7),
    'voltaram_7d', (select count(*) from (
                      select c.conta_id from privado.contas_ativas c
                       where c.dia > hoje - 7
                       group by c.conta_id
                      having count(*) >= 2) x),
    'desde', (select min(c.dia) from privado.contas_ativas c)
  );
end
$$;
revoke execute on function public.admin_presenca() from public, anon, authenticated;
grant execute on function public.admin_presenca() to service_role;

-- o /equipe (a de 20261123120000, mais a presença)
create or replace function public.painel_no_site()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
  hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if not privado.pode_ver_painel_no_site() then
    raise exception 'Só a equipe do Publike vê o painel.' using errcode = '42501';
  end if;
  perform set_config('publike.painel_no_site', 'sim', true);
  v := jsonb_build_object(
    'resumo', public.admin_resumo(),
    'acessos', public.admin_acessos_site(),
    'presenca', public.admin_presenca(),
    'encerramentos', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.admin_motivos_encerramento(30) e),
    'matches_hoje', (select count(*) from public.curtidas c where c.status = 'match' and c.respondida_em >= hoje)
  );
  perform set_config('publike.painel_no_site', '', true);
  return v;
exception when others then
  perform set_config('publike.painel_no_site', '', true);
  raise;
end
$$;
revoke execute on function public.painel_no_site() from public, anon;
grant execute on function public.painel_no_site() to authenticated;
