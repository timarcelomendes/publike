-- O teto do mês do atendimento do WhatsApp (19/11/2026; Marcelo: "o uso em massa pode se tornar caro" e "Pode sim").
-- Desde 01/10/2026, a Meta cobra cada mensagem de atendimento depois das 1.000 grátis do mês de cada número. O teto
-- conta as respostas do mês (do robô e da equipe, de Brasília):
--   * 80% do teto: um e-mail para os Avisos para a equipe (uma vez por mês);
--   * no teto: o modo econômico. Quem procura trabalho recebe uma mensagem só por dia, com o link das vagas perto, e
--     sem a IA; quem contrata (e o Publicar pelo WhatsApp) segue normal, porque é quem traz vaga nova. Outro e-mail.
--   * Admin › WhatsApp › Conversas mostra o contador e muda o teto (0 desliga).
--
-- Pode rodar de novo.

alter table privado.config_whatsapp
  add column if not exists atendimento_teto_mes integer not null default 5000,
  -- o mês ('2026-11') em que já foram os e-mails de 80% e do teto
  add column if not exists atendimento_teto_aviso80 text,
  add column if not exists atendimento_teto_aviso100 text;
alter table privado.config_whatsapp drop constraint if exists config_whatsapp_teto_check;
alter table privado.config_whatsapp add constraint config_whatsapp_teto_check
  check (atendimento_teto_mes between 0 and 1000000);

-- o e-mail para a equipe
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('aviso_whatsapp_teto', 'equipe', 63, 'Teto do mês do WhatsApp',
     'Aviso para a equipe quando as respostas do atendimento do WhatsApp chegam a 80% do teto do mês e quando chegam '
       || 'ao teto (o modo econômico). Uma vez de cada por mês.',
     array['enviadas', 'teto', 'situacao'],
     'WhatsApp: {{enviadas}} de {{teto}} respostas no mês',
     E'O atendimento do WhatsApp já mandou {{enviadas}} das {{teto}} respostas do teto deste mês.\n\n{{situacao}}\n\n'
       || 'A Meta cobra cada mensagem de atendimento depois das 1.000 grátis do mês. Para mudar o teto, vá em '
       || 'Admin › WhatsApp › Conversas.',
     null::text)
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- as respostas do mês (de Brasília)
create or replace function privado.whatsapp_respostas_do_mes()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from privado.whatsapp_conversa_mensagens m
   where m.de in ('robo', 'equipe')
     and m.criado_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
$$;
revoke all on function privado.whatsapp_respostas_do_mes() from public;

-- o robô: o teto, as respostas do mês, se está no modo econômico e se esta conversa já recebeu resposta hoje; manda os
-- e-mails de 80% e do teto (uma vez por mês). Volatile: a conferência da chave marca o uso, e os avisos gravam.
create or replace function public.servidor_whatsapp_teto(p_chave text, p_conversa text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_whatsapp;
  v_enviadas integer := privado.whatsapp_respostas_do_mes();
  v_mes text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_hoje timestamptz := ((now() at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo');
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_whatsapp where id;
  if not found or c.atendimento_teto_mes = 0 then
    return jsonb_build_object('teto', 0, 'enviadas', v_enviadas, 'economico', false, 'respondida_hoje', false);
  end if;
  if v_enviadas >= c.atendimento_teto_mes and c.atendimento_teto_aviso100 is distinct from v_mes then
    update privado.config_whatsapp set atendimento_teto_aviso100 = v_mes, atendimento_teto_aviso80 = v_mes where id;
    perform privado.avisar_equipe('aviso_whatsapp_teto', jsonb_build_object(
      'enviadas', v_enviadas, 'teto', c.atendimento_teto_mes,
      'situacao', 'Chegou ao teto: quem procura trabalho passa a receber uma mensagem só por dia, com o link das vagas, '
        || 'sem a IA. Quem contrata segue normal.',
      'caminho', '/admin/whatsapp?aba=conversas'));
  elsif v_enviadas >= c.atendimento_teto_mes * 0.8 and c.atendimento_teto_aviso80 is distinct from v_mes then
    update privado.config_whatsapp set atendimento_teto_aviso80 = v_mes where id;
    perform privado.avisar_equipe('aviso_whatsapp_teto', jsonb_build_object(
      'enviadas', v_enviadas, 'teto', c.atendimento_teto_mes,
      'situacao', 'Passou de 80% do teto. No teto, quem procura trabalho passa a receber uma mensagem só por dia, com '
        || 'o link das vagas.',
      'caminho', '/admin/whatsapp?aba=conversas'));
  end if;
  return jsonb_build_object(
    'teto', c.atendimento_teto_mes,
    'enviadas', v_enviadas,
    'economico', v_enviadas >= c.atendimento_teto_mes,
    'respondida_hoje', exists (select 1 from privado.whatsapp_conversa_mensagens m
                                where m.chave = p_conversa and m.de = 'robo' and m.criado_em >= v_hoje));
end
$$;
revoke execute on function public.servidor_whatsapp_teto(text, text) from public;
grant execute on function public.servidor_whatsapp_teto(text, text) to anon, authenticated, service_role;

-- o Admin: o contador e o teto
create or replace function public.admin_whatsapp_teto()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'teto', coalesce((select c.atendimento_teto_mes from privado.config_whatsapp c where c.id), 5000),
    'enviadas', privado.whatsapp_respostas_do_mes());
end
$$;

create or replace function public.admin_salvar_teto_whatsapp(p_teto integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  update privado.config_whatsapp
     set atendimento_teto_mes = least(greatest(coalesce(p_teto, atendimento_teto_mes), 0), 1000000),
         -- teto novo: os e-mails do mês valem de novo
         atendimento_teto_aviso80 = null,
         atendimento_teto_aviso100 = null,
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where id;
end
$$;
revoke execute on function public.admin_whatsapp_teto(), public.admin_salvar_teto_whatsapp(integer) from public, anon;
grant execute on function public.admin_whatsapp_teto(), public.admin_salvar_teto_whatsapp(integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270808120000_whatsapp_teto_do_mes');
