-- E-mail às empresas: quando a caixa recusa (18/11/2026). O primeiro envio voltou "535 5.7.8 Authentication Failed":
-- o robô entrava no servidor do Zoho (o padrão era smtp.zoho.com), mas a caixa marcelo@publike.org é do Email
-- Profissional da GoDaddy (Titan), que envia pelo smtpout.secureserver.net. A empresa ficou marcada como "falhou" e, a
-- cada intervalo, outra iria junto. Agora:
--
-- 1. privado.email_empresas ganha o porquê de ter parado (parado_motivo, parado_em) e uma espera (parado_ate);
-- 2. servidor_email_empresas_devolver: o robô devolve a empresa à fila quando o problema é da caixa (o login, o
--    remetente que a caixa não aceita, a conexão) e, conforme o caso, desliga o envio (e avisa a equipe por e-mail)
--    ou só espera 30 minutos (a conexão que caiu);
-- 3. servidor_email_empresas_pegar respeita a espera;
-- 4. ligar de novo no Admin limpa o motivo (um gatilho), e admin_email_empresas_parada mostra o motivo na tela.
--
-- Pode rodar de novo.

alter table privado.email_empresas add column if not exists parado_motivo text;
alter table privado.email_empresas add column if not exists parado_em timestamptz;
alter table privado.email_empresas add column if not exists parado_ate timestamptz;

-- ligar de novo limpa o motivo e a espera
create or replace function privado.email_empresas_ao_ligar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ligado and old.ligado is distinct from true then
    new.parado_motivo := null;
    new.parado_em := null;
    new.parado_ate := null;
  end if;
  return new;
end
$$;
drop trigger if exists email_empresas_ao_ligar on privado.email_empresas;
create trigger email_empresas_ao_ligar
  before update on privado.email_empresas
  for each row execute function privado.email_empresas_ao_ligar();

-- 2. O robô devolve à fila quando o problema é da caixa --------------------------------------------------------------

create or replace function public.servidor_email_empresas_devolver(
  p_chave text, p_id bigint, p_motivo text, p_desligar boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := left(coalesce(nullif(btrim(p_motivo), ''), 'A caixa recusou o envio.'), 300);
  v_estava boolean;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.email_empresas_envios e
     set situacao = 'na_fila', enviando_em = null, erro = null
   where e.id = p_id and e.situacao = 'enviando';
  select c.ligado into v_estava from privado.email_empresas c where c.id;
  if coalesce(p_desligar, false) then
    update privado.email_empresas
       set ligado = false, parado_motivo = v_motivo, parado_em = now(), parado_ate = null
     where id;
    -- uma vez por parada: o aviso à equipe sai só quando estava ligado
    if v_estava then
      perform privado.avisar_equipe('aviso_sistema', jsonb_build_object(
        'titulo', 'O e-mail às empresas parou',
        'detalhe', left('A caixa recusou o envio e o Publike desligou o e-mail às empresas, sem marcar nenhuma empresa '
                        || 'como falha. O motivo: ' || v_motivo || ' Conserte e ligue de novo em Admin › E-mail às empresas.',
                        1000),
        'caminho', '/admin/email-empresas'));
    end if;
  else
    update privado.email_empresas
       set parado_motivo = v_motivo, parado_em = now(), parado_ate = now() + interval '30 minutes'
     where id;
  end if;
end
$$;
revoke execute on function public.servidor_email_empresas_devolver(text, bigint, text, boolean) from public;
grant execute on function public.servidor_email_empresas_devolver(text, bigint, text, boolean)
  to anon, authenticated, service_role;

-- 3. O robô respeita a espera --------------------------------------------------------------------------------------

create or replace function public.servidor_email_empresas_pegar(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.email_empresas;
  v_agora timestamp := now() at time zone 'America/Sao_Paulo';
  v_hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_espaco interval;
  v_e privado.email_empresas_envios;
begin
  perform privado.exigir_servidor(p_chave);
  -- o robô caiu no meio: não manda de novo (pode ter saído)
  update privado.email_empresas_envios e set situacao = 'falhou', erro = 'sem confirmação do envio'
   where e.situacao = 'enviando' and e.enviando_em < now() - interval '15 minutes';
  select * into cfg from privado.email_empresas where id;
  if not found or not cfg.ligado then
    return null;
  end if;
  -- a caixa caiu há pouco: espera
  if cfg.parado_ate is not null and cfg.parado_ate > now() then
    return null;
  end if;
  if extract(isodow from v_agora) > 5
     or extract(hour from v_agora) < cfg.hora_inicio or extract(hour from v_agora) >= cfg.hora_fim then
    return null;
  end if;
  if (select count(*) from privado.email_empresas_envios e where e.enviado_em >= v_hoje
                                                              or e.enviando_em >= v_hoje) >= cfg.por_dia then
    return null;
  end if;
  v_espaco := make_interval(mins => greatest(((cfg.hora_fim - cfg.hora_inicio) * 60) / cfg.por_dia, 1));
  if exists (select 1 from privado.email_empresas_envios e
              where coalesce(e.enviado_em, e.enviando_em) > now() - v_espaco) then
    return null;
  end if;
  select * into v_e from privado.email_empresas_envios e
   where e.situacao = 'na_fila'
     and not exists (select 1 from privado.email_empresas_sair s where s.email = lower(btrim(e.email)))
   order by e.prioridade desc, e.id
   limit 1
   for update skip locked;
  if not found then
    return null;
  end if;
  update privado.email_empresas_envios set situacao = 'enviando', enviando_em = now() where id = v_e.id;
  return jsonb_build_object(
    'id', v_e.id, 'token', v_e.token, 'nome', v_e.nome, 'email', v_e.email,
    'assunto', cfg.assunto, 'texto', cfg.texto,
    'remetente_nome', cfg.remetente_nome, 'remetente_email', cfg.remetente_email);
end
$$;

-- 4. A tela: por que parou ----------------------------------------------------------------------------------------

create or replace function public.admin_email_empresas_parada()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg privado.email_empresas;
begin
  perform privado.exigir_equipe_email_empresas();
  select * into cfg from privado.email_empresas where id;
  if cfg.parado_motivo is null then
    return null;
  end if;
  return jsonb_build_object('motivo', cfg.parado_motivo, 'em', cfg.parado_em,
                            'ate', case when cfg.parado_ate > now() then cfg.parado_ate end,
                            'desligado', not cfg.ligado);
end
$$;
revoke execute on function public.admin_email_empresas_parada() from public, anon;
grant execute on function public.admin_email_empresas_parada() to authenticated, service_role;

-- a do primeiro envio (18/11, 14h04): o login recusado, não a empresa
update privado.email_empresas_envios set situacao = 'na_fila', erro = null, enviando_em = null
 where situacao = 'falhou' and erro ilike '%535%';
update privado.email_empresas
   set parado_motivo = coalesce(parado_motivo,
         'A caixa recusou o login (535): o envio ia para o servidor do Zoho, mas a caixa marcelo@publike.org é do '
         || 'Email Profissional da GoDaddy (Titan). Com o servidor da GoDaddy (smtpout.secureserver.net) e a senha da '
         || 'caixa, ligue de novo.'),
       parado_em = coalesce(parado_em, now())
 where id and not ligado
   -- só onde a fila já foi usada (em produção, 18/11); num banco novo, nada
   and exists (select 1 from privado.email_empresas_envios);

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270727120000_email_empresas_caixa_recusada');
