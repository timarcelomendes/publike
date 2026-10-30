-- O bloco "On-line e quem voltou" do admin, conferido contra o banco em 30/10/2026. Pode rodar de novo.
-- Rode depois de 20261216120000_funil_publicar.sql.
-- 1) As contas da equipe (moderadores e quem vê o painel no site) saem das contas de hoje e dos 7 dias:
--    eram 2 das 55 contas e 2 das 8 que voltaram. O total delas fica à parte (equipe_7d), para o painel dizer.
-- 2) A troca de página de quem ainda não tem o acesso de hoje (a aba aberta na virada do dia, ou que ficou
--    aberta de um dia para o outro) cria o acesso do dia, sem somar página. Antes, essa pessoa só voltava a
--    aparecer on-line (e nas visitas do dia) quando abria uma página inteira.

create or replace function public.marcar_online(p_ip text, p_navegador text)
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
  -- o sorteio do dia, como em contar_acesso (a primeira coisa do dia pode ser uma troca de página)
  select a.sorteio into s from privado.sorteio_acessos a where a.dia = hoje;
  if s is null then
    insert into privado.sorteio_acessos (dia) values (hoje) on conflict (dia) do nothing;
    select a.sorteio into s from privado.sorteio_acessos a where a.dia = hoje;
    delete from privado.sorteio_acessos a where a.dia < hoje;
  end if;
  -- a mesma trava contra enxurrada de contar_acesso
  if (select count(*) from privado.acessos_site a where a.dia = hoje) < 200000 then
    insert into privado.acessos_site as a (dia, visitante, com_conta, hora, visto_em, paginas)
    values (hoje,
            sha256(convert_to(s || '|' || p_ip || '|' || left(coalesce(p_navegador, ''), 300), 'UTF8')),
            (select auth.uid()) is not null,
            extract(hour from agora)::smallint,
            now(),
            -- não é página aberta inteira: a pessoa conta no dia, mas não soma página
            0)
    on conflict (dia, visitante) do update
      set visto_em = now(),
          com_conta = a.com_conta or excluded.com_conta;
  end if;
  if (select auth.uid()) is not null then
    insert into privado.contas_ativas (dia, conta_id) values (hoje, (select auth.uid())) on conflict do nothing;
  end if;
end
$$;
revoke execute on function public.marcar_online(text, text) from public;
grant execute on function public.marcar_online(text, text) to anon, authenticated;

-- a de 20261130120000, sem as contas da equipe
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
  return (
    with equipe as (
      select m.perfil_id as conta_id from public.moderadores m
      union
      select p.usuario_id from privado.painel_no_site p
    ),
    contas as (
      select c.dia, c.conta_id from privado.contas_ativas c
       where c.dia > hoje - 7
         and not exists (select 1 from equipe e where e.conta_id = c.conta_id)
    )
    select jsonb_build_object(
      'online', (select count(*) from privado.acessos_site a
                  where a.dia = hoje and a.visto_em >= now() - interval '5 minutes'),
      'online_com_conta', (select count(*) from privado.acessos_site a
                            where a.dia = hoje and a.com_conta and a.visto_em >= now() - interval '5 minutes'),
      'contas_hoje', (select count(*) from contas c where c.dia = hoje),
      'voltaram_hoje', (select count(*) from contas c
                          join auth.users u on u.id = c.conta_id
                         where c.dia = hoje and u.created_at < inicio_de_hoje),
      'contas_7d', (select count(distinct c.conta_id) from contas c),
      'voltaram_7d', (select count(*) from (
                        select c.conta_id from contas c group by c.conta_id having count(*) >= 2) x),
      -- as contas da equipe que entraram nos 7 dias (fora dos números acima)
      'equipe_7d', (select count(distinct c.conta_id) from privado.contas_ativas c
                     where c.dia > hoje - 7 and exists (select 1 from equipe e where e.conta_id = c.conta_id)),
      'desde', (select min(c.dia) from privado.contas_ativas c)
    )
  );
end
$$;
revoke execute on function public.admin_presenca() from public, anon, authenticated;
grant execute on function public.admin_presenca() to service_role;

notify pgrst, 'reload schema';
