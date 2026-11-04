-- Todos os e-mails controlados em Admin › E-mails (claude/plano-central-de-emails.md), parte 1: o catálogo.
-- Pode rodar de novo.
--
--   * privado.regras_email: uma chave por modelo de e-mail (ligado ou não), começando como está hoje (as
--     chaves antigas de config_site: curtida, match, moderação, conta, boas-vindas e os avisos da equipe).
--   * enfileirar_email passa a olhar a chave do modelo; servidor_pegar_emails cancela o que está desligado
--     (o que entra direto na fila: semana, convites, mensagem da equipe, avisos da equipe).
--   * admin_ligar_email: liga e desliga, e mantém as colunas antigas de config_site iguais (os gatilhos dos
--     avisos da equipe ainda leem de lá).
--   * admin_emails_catalogo: cada modelo com a chave e os números (7 e 30 dias, falhas, o último).
--
-- Parte 2 · os números que eram fixos, editáveis em Admin › E-mails › Todos (começam com os valores de antes):
--   * regras_email.intervalo_min: no máximo 1 e-mail do modelo a cada N minutos para a mesma pessoa (30 para os
--     avisos que se repetem, 20 h para a busca salva; sem número, sem limite).
--   * privado.parametros_email (uma linha): o limite por dia por pessoa (30), o dia e a hora dos e-mails da
--     semana (segunda, 9h), e as regras do Volte a contratar (14 dias sem vaga, vagas dos últimos 180 dias,
--     um aviso a cada 28 dias, até 3 seguidos sem publicar, mínimo de 3 talentos).
--   * enfileirar_email, servidor_combinam_situacao e servidor_reativar_empresas leem de lá;
--     servidor_parametros_email dá os números ao site; admin_salvar_parametros_email e
--     admin_intervalo_email gravam.
--
-- Parte 3 · os e-mails que saem na hora, sem a fila, entram no catálogo (a chave, os números e Enviados):
--   * modelos novos: 'conta_acesso' (conta criada pela equipe), 'conta_acesso_link' (link para entrar, pedido à
--     equipe) e 'convite_convidado' (o convite de Admin › Convites para empresa de fora; o texto continua lá).
--   * admin_email_ligado: o site confere a chave antes de mandar; admin_registrar_email_direto: grava o envio
--     como enviado (sem o link de entrar).

create table if not exists privado.regras_email (
  modelo text primary key references public.modelos_email (chave) on delete cascade,
  ligado boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table privado.regras_email enable row level security;
alter table privado.regras_email add column if not exists intervalo_min integer
  check (intervalo_min is null or intervalo_min between 1 and 10080);

create table if not exists privado.parametros_email (
  id boolean primary key default true check (id),
  por_dia integer not null default 30 check (por_dia between 1 and 200),
  semana_dia smallint not null default 1 check (semana_dia between 1 and 7),
  semana_hora smallint not null default 9 check (semana_hora between 0 and 23),
  reativar_sem_vaga_dias integer not null default 14 check (reativar_sem_vaga_dias between 1 and 90),
  reativar_janela_dias integer not null default 180 check (reativar_janela_dias between 30 and 365),
  reativar_intervalo_dias integer not null default 28 check (reativar_intervalo_dias between 7 and 90),
  reativar_max_seguidos integer not null default 3 check (reativar_max_seguidos between 1 and 10),
  reativar_minimo_talentos integer not null default 3 check (reativar_minimo_talentos between 1 and 10),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table privado.parametros_email enable row level security;
insert into privado.parametros_email (id) values (true) on conflict (id) do nothing;

-- como está hoje: as chaves antigas viram as chaves dos modelos
insert into privado.regras_email (modelo, ligado)
select m.chave,
       case
         when m.chave = 'curtida' then c.email_curtida
         when m.chave = 'match' then c.email_match
         when m.chave in ('em_analise', 'removido', 'liberado') then c.email_moderacao
         when m.chave in ('conta_suspensa', 'conta_banida', 'conta_reativada') then c.email_conta
         when m.chave like 'boas\_vindas\_%' then coalesce(c.email_boas_vindas, true)
         when m.chave = 'aviso_denuncia' then c.aviso_denuncia
         when m.chave = 'aviso_cadastro' then c.aviso_cadastro
         when m.chave = 'aviso_retirado' then c.aviso_retirado
         when m.chave = 'aviso_falha' then coalesce(c.aviso_falha, true)
         else true
       end
  from public.modelos_email m
  cross join (select * from public.config_site limit 1) c
on conflict (modelo) do nothing;
update privado.regras_email r
   set intervalo_min = case when r.modelo = 'busca' then 1200 else 30 end
 where r.intervalo_min is null and r.atualizado_por is null
   and r.modelo in ('busca', 'curtida', 'etapa', 'contratacao', 'recomendacao', 'seguindo', 'mensagem', 'convite',
                    'lembrete_curtida');

-- o modelo está ligado (sem linha, ligado: um modelo novo nasce ligado)
create or replace function privado.email_ligado(p_modelo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.ligado from privado.regras_email r where r.modelo = p_modelo), true)
$$;
revoke execute on function privado.email_ligado(text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION privado.enfileirar_email(p_usuario uuid, p_modelo text, p_dados jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg public.config_site;
  destino text;
  quer boolean;
  de_conta boolean := p_modelo in ('conta_suspensa', 'conta_banida', 'conta_reativada');
  v_grupo text := privado.grupo_do_aviso(p_modelo);
  v_sair jsonb := '{}'::jsonb;
  v_intervalo integer;
begin
  select * into cfg from public.config_site limit 1;
  if not found or not cfg.emails_ativos then
    return;
  end if;
  -- a chave de cada e-mail fica em Admin › E-mails › Todos (privado.regras_email)
  if not privado.email_ligado(p_modelo) then
    return;
  end if;
  -- avisos de conta vão mesmo para quem desligou os avisos
  if not de_conta then
    select c.receber_emails into quer from public.contatos c where c.perfil_id = p_usuario;
    if quer is false then
      return;
    end if;
  end if;
  -- o que a conta desligou na página Avisos e notificações (os avisos sem grupo chegam sempre)
  if v_grupo is not null and privado.aviso_desligado(p_usuario, p_modelo, 'email') then
    return;
  end if;
  -- no máximo um e-mail do modelo a cada N minutos para a mesma pessoa (Admin › E-mails › Todos)
  select r.intervalo_min into v_intervalo from privado.regras_email r where r.modelo = p_modelo;
  if v_intervalo is not null and exists (
    select 1 from privado.fila_emails f
     where f.usuario_id = p_usuario and f.modelo = p_modelo
       and f.criado_em > now() - make_interval(mins => v_intervalo)
  ) then
    return;
  end if;
  -- e o limite por dia para a mesma pessoa (avisos de conta e de moderação passam sempre)
  if not de_conta and p_modelo not in ('em_analise', 'removido', 'liberado') and (
    select count(*) from privado.fila_emails f
     where f.usuario_id = p_usuario and f.criado_em > now() - interval '1 day'
  ) >= coalesce((select pe.por_dia from privado.parametros_email pe), 30) then
    return;
  end if;
  -- só para o e-mail de login confirmado (nunca para um endereço que a pessoa só digitou)
  select nullif(btrim(u.email::text), '') into destino
    from auth.users u
   where u.id = p_usuario and u.email_confirmed_at is not null;
  if destino is null or destino !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return;
  end if;
  -- o "parar de receber" deste grupo (o rodapé e o cabeçalho List-Unsubscribe); sem a chave, o e-mail sai
  -- assim mesmo, com o rodapé de antes
  if v_grupo is not null then
    begin
      v_sair := jsonb_build_object('sair', privado.chave_de_aviso(p_usuario), 'grupo_aviso', v_grupo);
    exception
      when others then
        v_sair := '{}'::jsonb;
    end;
  end if;
  insert into privado.fila_emails (modelo, para, usuario_id, dados)
  values (p_modelo, lower(destino), p_usuario,
          jsonb_build_object('nome', coalesce(privado.nome_para_email(p_usuario), ''))
          || coalesce(p_dados, '{}'::jsonb) || jsonb_strip_nulls(v_sair));
exception
  when others then
    raise warning 'Publike: e-mail % não entrou na fila (%).', p_modelo, sqlerrm;
end
$function$;

CREATE OR REPLACE FUNCTION public.servidor_pegar_emails(p_chave text, p_limite integer DEFAULT 10, p_so_teste boolean DEFAULT false)
 RETURNS TABLE(id bigint, modelo text, grupo text, para text, dados jsonb, assunto text, corpo text, botao text, remetente_nome text, responder_para text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  perform privado.exigir_servidor(p_chave);
  -- envio que travou três vezes sem confirmação: desiste (melhor do que mandar repetido)
  update privado.fila_emails f
     set status = 'falhou', erro = coalesce(f.erro, 'O envio não foi confirmado.')
   where f.status = 'enviando' and f.tentar_depois <= now() and f.tentativas >= 3;
  -- aviso que ficou dias parado na fila não serve mais
  update privado.fila_emails f
     set status = 'cancelado', erro = 'Ficou mais de 3 dias na fila sem sair.'
   where f.status = 'pendente' and f.criado_em < now() - interval '3 days';

  -- e-mail desligado em Admin › E-mails › Todos: não sai (vale também para o que entra direto na fila)
  update privado.fila_emails f
     set status = 'cancelado', erro = 'Desligado em Admin › E-mails.'
   where f.status = 'pendente' and f.modelo <> 'teste' and not privado.email_ligado(f.modelo);

  return query
  with escolhidos as (
    select f.id from privado.fila_emails f
     where f.tentar_depois <= now() and (f.status = 'pendente' or (f.status = 'enviando' and f.tentativas < 3))
       and (not coalesce(p_so_teste, false) or f.modelo = 'teste')
     order by f.id
     limit least(greatest(coalesce(p_limite, 10), 1), 50)
     for update skip locked
  ), marcados as (
    update privado.fila_emails f
       set status = 'enviando', tentativas = f.tentativas + 1, tentar_depois = now() + interval '15 minutes'
      from escolhidos e
     where f.id = e.id
    returning f.id, f.modelo, f.para, f.dados
  )
  select m.id, m.modelo, me.grupo, m.para, m.dados, me.assunto, me.corpo, me.botao,
         c.remetente_nome, c.responder_para
    from marcados m
    join public.modelos_email me on me.chave = m.modelo
    cross join public.config_site c
   order by m.id;
end
$function$;

-- Admin: liga e desliga um e-mail. O de teste fica sempre ligado.
create or replace function public.admin_ligar_email(p_modelo text, p_ligado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  if p_modelo = 'teste' then
    raise exception 'O e-mail de teste fica sempre ligado.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.modelos_email m where m.chave = p_modelo) then
    raise exception 'Esse e-mail não existe.' using errcode = 'P0001';
  end if;
  insert into privado.regras_email (modelo, ligado, atualizado_em, atualizado_por)
  values (p_modelo, coalesce(p_ligado, false), now(), (select auth.uid()))
  on conflict (modelo) do update
    set ligado = excluded.ligado, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por;
  -- as colunas antigas acompanham (os gatilhos dos avisos da equipe e as telas de antes leem de lá)
  update public.config_site c
     set email_curtida = privado.email_ligado('curtida'),
         email_match = privado.email_ligado('match'),
         email_moderacao = privado.email_ligado('em_analise') and privado.email_ligado('removido')
                           and privado.email_ligado('liberado'),
         email_conta = privado.email_ligado('conta_suspensa') and privado.email_ligado('conta_banida')
                       and privado.email_ligado('conta_reativada'),
         email_boas_vindas = privado.email_ligado('boas_vindas_pessoa') and privado.email_ligado('boas_vindas_empresa')
                             and privado.email_ligado('boas_vindas_agencia')
                             and privado.email_ligado('boas_vindas_prestador'),
         aviso_denuncia = privado.email_ligado('aviso_denuncia'),
         aviso_cadastro = privado.email_ligado('aviso_cadastro'),
         aviso_retirado = privado.email_ligado('aviso_retirado'),
         aviso_falha = privado.email_ligado('aviso_falha'),
         atualizado_em = now(), atualizado_por = (select auth.uid())
   where c.id;
end
$$;
revoke execute on function public.admin_ligar_email(text, boolean) from public, anon;
grant execute on function public.admin_ligar_email(text, boolean) to authenticated, service_role;

-- Admin: o catálogo, com a chave e os números de cada modelo
drop function if exists public.admin_emails_catalogo();
create or replace function public.admin_emails_catalogo()
returns table (chave text, grupo text, ordem smallint, nome text, descricao text, assunto text, ligado boolean,
               intervalo_min integer,
               enviados_7 integer, enviados_30 integer, falhas_30 integer, cancelados_30 integer,
               na_fila integer, ultimo timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return query
  select m.chave, m.grupo, m.ordem, m.nome, m.descricao, m.assunto, privado.email_ligado(m.chave),
         (select r.intervalo_min from privado.regras_email r where r.modelo = m.chave),
         coalesce(f.enviados_7, 0)::integer, coalesce(f.enviados_30, 0)::integer, coalesce(f.falhas_30, 0)::integer,
         coalesce(f.cancelados_30, 0)::integer, coalesce(f.na_fila, 0)::integer, f.ultimo
    from public.modelos_email m
    left join (
      select e.modelo,
             count(*) filter (where e.status = 'enviado' and e.enviado_em > now() - interval '7 days') as enviados_7,
             count(*) filter (where e.status = 'enviado') as enviados_30,
             count(*) filter (where e.status = 'falhou') as falhas_30,
             count(*) filter (where e.status = 'cancelado') as cancelados_30,
             count(*) filter (where e.status in ('pendente', 'enviando')) as na_fila,
             max(e.enviado_em) as ultimo
        from privado.fila_emails e
       where e.criado_em > now() - interval '30 days'
       group by e.modelo
    ) f on f.modelo = m.chave
   order by m.grupo, m.ordem, m.chave;
end
$$;
revoke execute on function public.admin_emails_catalogo() from public, anon;
grant execute on function public.admin_emails_catalogo() to authenticated, service_role;


-- Parte 2 · o dia e a hora dos e-mails da semana (a de 20261119120000, com o dia e a hora de parametros_email;
-- a "semana" continua sendo a segunda, a chave dos envios)
create or replace function public.servidor_combinam_situacao(p_chave text)
returns table (ligado boolean, semana date, pode boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  agora timestamp := now() at time zone 'America/Sao_Paulo';
  segunda date := date_trunc('week', agora)::date;
  pe privado.parametros_email;
  dia date;
begin
  perform privado.exigir_servidor(p_chave);
  select * into pe from privado.parametros_email limit 1;
  dia := segunda + (coalesce(pe.semana_dia, 1) - 1);
  return query
  select coalesce((select c.combinam_semana from public.config_site c limit 1), false),
         segunda,
         agora::date = dia and agora >= dia + make_time(coalesce(pe.semana_hora, 9), 0, 0);
end
$$;

-- Parte 2 · as regras do Volte a contratar (a de 20270130120000, com os números de parametros_email)
create or replace function public.servidor_reativar_empresas(p_chave text, p_semana date, p_limite integer default 50)
returns table (perfil_id uuid, vagas jsonb, ja uuid[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  pe privado.parametros_email;
begin
  perform privado.exigir_servidor(p_chave);
  select * into pe from privado.parametros_email limit 1;
  return query
  with saidas as (
    select a.*,
           case when a.preenchida_em is not null then a.preenchida_em
                when a.expira_em <= now() then a.expira_em
                else a.atualizado_em end as saiu_em
      from public.anuncios a
     where a.tipo = 'vaga' and a.status not in ('em_analise', 'removido', 'pausado')
       and (a.status in ('encerrado', 'expirado') or a.preenchida_em is not null or a.expira_em <= now())
  ), contas as (
    select p.id, max(s.saiu_em) as ultima
      from public.perfis p
      join saidas s on s.autor_id = p.id
     where p.tipo in ('empresa', 'comercio', 'agencia') and not coalesce(p.suspenso_ate > now(), false)
     group by p.id
  )
  select c.id,
         (select jsonb_agg(jsonb_build_object(
                   'id', v.id, 'titulo', v.titulo, 'descricao', v.descricao,
                   'escolaridade_minima', v.escolaridade_minima, 'experiencia', v.experiencia, 'cnh', v.cnh,
                   'cidade', v.cidade, 'bairro', v.bairro, 'jornada', v.jornada,
                   'horario_detalhe', v.horario_detalhe, 'horario', v.horario) order by v.saiu_em desc)
            from (select * from saidas s where s.autor_id = c.id
                     and s.saiu_em > now() - make_interval(days => coalesce(pe.reativar_janela_dias, 180))
                   order by s.saiu_em desc limit 5) v),
         array(select cu.perfil_id from public.curtidas cu join public.anuncios a on a.id = cu.anuncio_id
                where a.autor_id = c.id
               union select x.talento_id from public.conexoes x where x.empresa_id = c.id
               union select unnest(e.ids) from privado.combinam_enviados e
                      where e.conta_id = c.id and e.tipo in ('talentos_semana', 'talentos_reativar'))
    from contas c
   where c.ultima > now() - make_interval(days => coalesce(pe.reativar_janela_dias, 180))
     and c.ultima <= now() - make_interval(days => coalesce(pe.reativar_sem_vaga_dias, 14))
     -- sem vaga no ar, pausada ou esperando a moderação
     and not exists (select 1 from public.anuncios a
                      where a.autor_id = c.id and a.tipo = 'vaga' and a.preenchida_em is null
                        and a.status in ('ativo', 'pausado', 'em_analise') and a.expira_em > now())
     -- nada nesta semana (nem a conta vista sem talento bom)
     and not exists (select 1 from privado.combinam_enviados e
                      where e.semana = p_semana and e.conta_id = c.id and e.tipo = 'talentos_reativar')
     -- um aviso a cada N dias
     and not exists (select 1 from privado.combinam_enviados e
                      where e.conta_id = c.id and e.tipo = 'talentos_reativar' and cardinality(e.ids) > 0
                        and e.criado_em > now() - make_interval(days => coalesce(pe.reativar_intervalo_dias, 28)))
     -- e até N seguidos sem publicar (conta a partir da vaga mais nova da conta)
     and (select count(*) from privado.combinam_enviados e
           where e.conta_id = c.id and e.tipo = 'talentos_reativar' and cardinality(e.ids) > 0
             and e.criado_em > (select max(a.criado_em) from public.anuncios a
                                 where a.autor_id = c.id and a.tipo = 'vaga')) < coalesce(pe.reativar_max_seguidos, 3)
   order by c.id
   limit least(greatest(coalesce(p_limite, 50), 1), 200);
end
$$;

-- Parte 2 · os números para o site (o mínimo de talentos do Volte a contratar é contado no site)
create or replace function public.servidor_parametros_email(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select to_jsonb(pe) - 'id' - 'atualizado_por' from privado.parametros_email pe limit 1);
end
$$;
revoke execute on function public.servidor_parametros_email(text) from public;
grant execute on function public.servidor_parametros_email(text) to anon, authenticated, service_role;

-- Parte 2 · Admin: os números e o intervalo de cada e-mail
create or replace function public.admin_parametros_email()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return (select to_jsonb(pe) - 'id' - 'atualizado_por' from privado.parametros_email pe limit 1);
end
$$;
revoke execute on function public.admin_parametros_email() from public, anon;
grant execute on function public.admin_parametros_email() to authenticated, service_role;

create or replace function public.admin_salvar_parametros_email(
  p_por_dia integer, p_semana_dia integer, p_semana_hora integer, p_reativar_sem_vaga_dias integer,
  p_reativar_janela_dias integer, p_reativar_intervalo_dias integer, p_reativar_max_seguidos integer,
  p_reativar_minimo_talentos integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  insert into privado.parametros_email (id) values (true) on conflict (id) do nothing;
  update privado.parametros_email
     set por_dia = p_por_dia, semana_dia = p_semana_dia, semana_hora = p_semana_hora,
         reativar_sem_vaga_dias = p_reativar_sem_vaga_dias, reativar_janela_dias = p_reativar_janela_dias,
         reativar_intervalo_dias = p_reativar_intervalo_dias, reativar_max_seguidos = p_reativar_max_seguidos,
         reativar_minimo_talentos = p_reativar_minimo_talentos,
         atualizado_em = now(), atualizado_por = (select auth.uid())
   where id;
exception
  when check_violation then
    raise exception 'Confira os números: algum está fora do permitido.' using errcode = 'P0001';
end
$$;
revoke execute on function public.admin_salvar_parametros_email(integer, integer, integer, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.admin_salvar_parametros_email(integer, integer, integer, integer, integer, integer, integer, integer) to authenticated, service_role;

create or replace function public.admin_intervalo_email(p_modelo text, p_minutos integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  if p_minutos is not null and (p_minutos < 1 or p_minutos > 10080) then
    raise exception 'Use de 1 minuto a 7 dias (ou deixe em branco, sem limite).' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.modelos_email m where m.chave = p_modelo) then
    raise exception 'Esse e-mail não existe.' using errcode = 'P0001';
  end if;
  insert into privado.regras_email (modelo, intervalo_min, atualizado_em, atualizado_por)
  values (p_modelo, p_minutos, now(), (select auth.uid()))
  on conflict (modelo) do update
    set intervalo_min = excluded.intervalo_min, atualizado_em = excluded.atualizado_em,
        atualizado_por = excluded.atualizado_por;
end
$$;
revoke execute on function public.admin_intervalo_email(text, integer) from public, anon;
grant execute on function public.admin_intervalo_email(text, integer) to authenticated, service_role;


-- Parte 3 · os e-mails que saem na hora (sem a fila)
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
values
  ('conta_acesso', 'usuarios', 95, 'Acesso: conta criada pela equipe',
   'Quando a equipe cria a conta em Admin › Contas e manda o link de entrar. Sai na hora, sem a fila: o link vale pouco tempo e não fica guardado.',
   array['nome', 'email', 'publicados'],
   'Sua conta no Publike está pronta',
   E'Olá, {{nome}}!\n\nCriamos a sua conta no Publike, o mural de vagas e serviços, como combinamos.\n\n{{publicados}}\n\nToque no botão para entrar. Não precisa de senha. No primeiro acesso, confira os seus dados e aceite as regras e a política de privacidade.\n\nO link vale por pouco tempo e funciona uma vez. Se ele vencer, entre em publike.org/entrar com este e-mail ({{email}}) e peça um link novo.\n\nNão pediu esta conta? É só ignorar este e-mail ou responder avisando, que a gente apaga.',
   'Entrar no Publike',
   'Sua conta no Publike está pronta',
   E'Olá, {{nome}}!\n\nCriamos a sua conta no Publike, o mural de vagas e serviços, como combinamos.\n\n{{publicados}}\n\nToque no botão para entrar. Não precisa de senha. No primeiro acesso, confira os seus dados e aceite as regras e a política de privacidade.\n\nO link vale por pouco tempo e funciona uma vez. Se ele vencer, entre em publike.org/entrar com este e-mail ({{email}}) e peça um link novo.\n\nNão pediu esta conta? É só ignorar este e-mail ou responder avisando, que a gente apaga.',
   'Entrar no Publike'),
  ('conta_acesso_link', 'usuarios', 96, 'Acesso: link para entrar',
   'Quando a equipe manda de novo o link de entrar, pela ficha da conta (a pessoa pediu ajuda para entrar). Sai na hora, sem a fila.',
   array['nome', 'email', 'publicados'],
   'Seu link para entrar no Publike',
   E'Olá, {{nome}}!\n\nAqui está o seu link para entrar no Publike. Não precisa de senha.\n\n{{publicados}}\n\nO link vale por pouco tempo e funciona uma vez. Se ele vencer, entre em publike.org/entrar com este e-mail ({{email}}) e peça um link novo.',
   'Entrar no Publike',
   'Seu link para entrar no Publike',
   E'Olá, {{nome}}!\n\nAqui está o seu link para entrar no Publike. Não precisa de senha.\n\n{{publicados}}\n\nO link vale por pouco tempo e funciona uma vez. Se ele vencer, entre em publike.org/entrar com este e-mail ({{email}}) e peça um link novo.',
   'Entrar no Publike'),
  ('convite_convidado', 'usuarios', 97, 'Convite: empresa de fora',
   'O convite de Admin › Convites para a empresa que ainda não está no Publike (achada num anúncio ou num arquivo). Sai na hora, pelo botão de cada convidado; o texto e a assinatura ficam lá.',
   array['nome'],
   'Convite para publicar as suas vagas no Publike',
   'O texto deste convite é montado em Admin › Convites, com as vagas da empresa e a sua assinatura.',
   null,
   'Convite para publicar as suas vagas no Publike',
   'O texto deste convite é montado em Admin › Convites, com as vagas da empresa e a sua assinatura.',
   null)
on conflict (chave) do nothing;
insert into privado.regras_email (modelo) values ('conta_acesso'), ('conta_acesso_link'), ('convite_convidado')
on conflict (modelo) do nothing;

create or replace function public.admin_email_ligado(p_modelo text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return privado.email_ligado(p_modelo);
end
$$;
revoke execute on function public.admin_email_ligado(text) from public, anon;
grant execute on function public.admin_email_ligado(text) to authenticated, service_role;

create or replace function public.admin_registrar_email_direto(p_modelo text, p_para text, p_usuario uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  if p_modelo not in ('conta_acesso', 'conta_acesso_link', 'convite_convidado') then
    raise exception 'Esse e-mail passa pela fila.' using errcode = 'P0001';
  end if;
  insert into privado.fila_emails (modelo, para, usuario_id, dados, status, tentativas, enviado_em)
  values (p_modelo, lower(btrim(p_para)), p_usuario, '{}'::jsonb, 'enviado', 1, now());
end
$$;
revoke execute on function public.admin_registrar_email_direto(text, text, uuid) from public, anon;
grant execute on function public.admin_registrar_email_direto(text, text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
