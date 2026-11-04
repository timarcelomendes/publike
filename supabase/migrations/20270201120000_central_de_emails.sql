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

create table if not exists privado.regras_email (
  modelo text primary key references public.modelos_email (chave) on delete cascade,
  ligado boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table privado.regras_email enable row level security;

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
  -- vaga nova de uma busca com aviso: o sino avisa cada uma; o e-mail, no máximo um a cada 20 horas
  if p_modelo = 'busca' and exists (
    select 1 from privado.fila_emails f
     where f.usuario_id = p_usuario and f.modelo = 'busca' and f.criado_em > now() - interval '20 hours'
  ) then
    return;
  end if;
  -- avisos que podem se repetir: no máximo um do mesmo tipo a cada 30 minutos para a mesma pessoa
  if p_modelo in ('curtida', 'etapa', 'contratacao', 'recomendacao', 'seguindo', 'mensagem', 'convite',
                  'lembrete_curtida') and exists (
    select 1 from privado.fila_emails f
     where f.usuario_id = p_usuario and f.modelo = p_modelo and f.criado_em > now() - interval '30 minutes'
  ) then
    return;
  end if;
  -- e no máximo 30 e-mails por dia para a mesma pessoa (avisos de conta e de moderação passam sempre)
  if not de_conta and p_modelo not in ('em_analise', 'removido', 'liberado') and (
    select count(*) from privado.fila_emails f
     where f.usuario_id = p_usuario and f.criado_em > now() - interval '1 day'
  ) >= 30 then
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
create or replace function public.admin_emails_catalogo()
returns table (chave text, grupo text, ordem smallint, nome text, descricao text, assunto text, ligado boolean,
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

notify pgrst, 'reload schema';
