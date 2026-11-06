-- Por onde chegam e quem entra (claude/plano-visitante-que-entra.md; 06/11/2026). O acesso do dia
-- (privado.acessos_site, que não guarda quem é) ganha a porta de entrada (o grupo da primeira página aberta), se a
-- pessoa já chegou com a conta aberta e se ficou (navegou mais de 2 minutos ou abriu outra página inteira). O admin
-- vê, por porta, quantos chegaram sem conta, quantos ficaram e quantos entraram na conta no mesmo dia. O funil de
-- quem chega sem conta ganha os eventos do "entrar num toque" (One Tap) e do convite que acompanha as vagas vistas.
-- contar_acesso e marcar_online ganham p_caminho, opcional: o site antigo continua chamando sem ele.
-- Rode depois de 20270225120000_prazo_da_entrevista_em_video.sql. Pode rodar de novo.

alter table privado.acessos_site add column if not exists porta text;
alter table privado.acessos_site add column if not exists chegou_com_conta boolean;
alter table privado.acessos_site add column if not exists ficou boolean not null default false;

-- a porta de um caminho do site ("/anuncio/…" → vaga); null: sem caminho (o site antigo)
create or replace function privado.porta_do_caminho(p_caminho text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_caminho is null or p_caminho = '' then null
    when p_caminho = '/' then 'inicio'
    when p_caminho ~ '^/anuncio/' then 'vaga'
    when p_caminho ~ '^/(vagas|servicos)(/|$)' then 'busca'
    when p_caminho ~ '^/(curriculo-simples|calculadora-rescisao|seguro-desemprego)(/|$)' then 'ferramenta'
    when p_caminho ~ '^/(conteudos|noticias)(/|$)' then 'conteudo'
    when p_caminho ~ '^/entrar(/|$)' then 'entrar'
    when p_caminho ~ '^/publicar(/|$)' then 'publicar'
    when p_caminho ~ '^/empresas(/|$)' then 'empresas'
    else 'outra'
  end
$$;
revoke execute on function privado.porta_do_caminho(text) from public;

-- 1. A página aberta inteira (a de 20261130120000, mais a porta, a conta na chegada e o "ficou") --------------
drop function if exists public.contar_acesso(text, text);
create or replace function public.contar_acesso(p_ip text, p_navegador text, p_caminho text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  agora timestamp := now() at time zone 'America/Sao_Paulo';
  hoje date := agora::date;
  s text;
  logado boolean := (select auth.uid()) is not null;
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
  insert into privado.acessos_site as a (dia, visitante, com_conta, hora, visto_em, porta, chegou_com_conta)
  values (hoje,
          sha256(convert_to(s || '|' || p_ip || '|' || left(coalesce(p_navegador, ''), 300), 'UTF8')),
          logado,
          extract(hour from agora)::smallint,
          now(),
          privado.porta_do_caminho(left(p_caminho, 300)),
          case when p_caminho is null then null else logado end)
  on conflict (dia, visitante) do update
    set paginas = a.paginas + 1,
        com_conta = a.com_conta or excluded.com_conta,
        visto_em = now(),
        -- abriu outra página inteira: ficou
        ficou = true,
        -- a primeira chamada do dia veio do site antigo (sem caminho) ou de uma troca de página: a porta é esta
        porta = coalesce(a.porta, excluded.porta),
        chegou_com_conta = coalesce(a.chegou_com_conta, excluded.chegou_com_conta);
  if logado then
    insert into privado.contas_ativas (dia, conta_id) values (hoje, (select auth.uid())) on conflict do nothing;
  end if;
end
$$;
revoke execute on function public.contar_acesso(text, text, text) from public;
grant execute on function public.contar_acesso(text, text, text) to anon, authenticated;

-- 2. A troca de página (a de 20261217120000, mais o "ficou": ela só chega com a marcação de 2 minutos vencida) ---
drop function if exists public.marcar_online(text, text);
create or replace function public.marcar_online(p_ip text, p_navegador text, p_caminho text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  agora timestamp := now() at time zone 'America/Sao_Paulo';
  hoje date := agora::date;
  s text;
  logado boolean := (select auth.uid()) is not null;
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
    insert into privado.acessos_site as a (dia, visitante, com_conta, hora, visto_em, paginas, porta, chegou_com_conta)
    values (hoje,
            sha256(convert_to(s || '|' || p_ip || '|' || left(coalesce(p_navegador, ''), 300), 'UTF8')),
            logado,
            extract(hour from agora)::smallint,
            now(),
            -- não é página aberta inteira: a pessoa conta no dia, mas não soma página
            0,
            privado.porta_do_caminho(left(p_caminho, 300)),
            case when p_caminho is null then null else logado end)
    on conflict (dia, visitante) do update
      set visto_em = now(),
          com_conta = a.com_conta or excluded.com_conta,
          -- trocou de página com a marcação de on-line (2 minutos) vencida: ficou navegando
          ficou = true;
  end if;
  if logado then
    insert into privado.contas_ativas (dia, conta_id) values (hoje, (select auth.uid())) on conflict do nothing;
  end if;
end
$$;
revoke execute on function public.marcar_online(text, text, text) from public;
grant execute on function public.marcar_online(text, text, text) to anon, authenticated;

-- 3. Por onde chegam, para o admin: só quem chegou sem conta, nos últimos `p_dias` dias (hoje incluído) ----------
create or replace function public.admin_portas_de_entrada(p_dias integer default 7)
returns table (porta text, visitantes bigint, ficaram bigint, entraram bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select a.porta,
         count(*)::bigint,
         count(*) filter (where a.ficou)::bigint,
         count(*) filter (where a.com_conta)::bigint
    from privado.acessos_site a
   where a.dia > (now() at time zone 'America/Sao_Paulo')::date - greatest(1, least(coalesce(p_dias, 7), 90))
     and a.porta is not null
     and a.chegou_com_conta is false
   group by a.porta
   order by count(*) desc
$$;
revoke all on function public.admin_portas_de_entrada(integer) from public, anon, authenticated;
grant execute on function public.admin_portas_de_entrada(integer) to service_role;

-- 4. O funil de quem chega sem conta: o "entrar num toque" e o convite ------------------------------------------
alter table privado.funil_visitante drop constraint if exists funil_visitante_evento_check;
alter table privado.funil_visitante add constraint funil_visitante_evento_check
  check (evento in ('home', 'curtir', 'publicar', 'curriculo', 'entrar',
                    'toque_mostrou', 'toque_entrou', 'convite_mostrou', 'convite_tocou'));

create or replace function public.registrar_funil_visitante(p_evento text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into privado.funil_visitante (dia, evento, total)
  select (now() at time zone 'America/Sao_Paulo')::date, p_evento, 1
   where p_evento in ('home', 'curtir', 'publicar', 'curriculo', 'entrar',
                      'toque_mostrou', 'toque_entrou', 'convite_mostrou', 'convite_tocou')
  on conflict (dia, evento) do update set total = privado.funil_visitante.total + 1;
$$;
revoke all on function public.registrar_funil_visitante(text) from public;
grant execute on function public.registrar_funil_visitante(text) to anon, authenticated;

notify pgrst, 'reload schema';
