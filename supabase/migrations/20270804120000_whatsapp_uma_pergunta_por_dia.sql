-- WhatsApp: uma pergunta de cada por dia e os aceites juntos (18/11/2026). Marcelo perguntou se os limites de
-- Admin › WhatsApp estavam funcionando; estavam (o de 4 por pessoa de manhã e o de 10 à tarde pararam cada conta
-- exatamente no limite), mas quem batia neles eram os avisos de cada candidatura, um a um: em 18/11, uma pessoa
-- recebeu 7 "A empresa te respondeu?" em 26 minutos (e mais 6 ficaram de fora), outra 7 "Você já começou a
-- trabalhar?" em pouco mais de uma hora, e outra teve 7 candidaturas aceitas em 7 minutos (3 avisos saíram e 4
-- ficaram de fora). A proposta, com o "Sim" dele:
--
--   1. As perguntas de retorno ("A empresa te respondeu?" e "Deu certo? Você começou?"): no máximo uma de cada por
--      pessoa por dia, a mais antiga primeiro. As outras esperam a vez na fila, com os mesmos botões de um toque
--      (enviar_depois_de = a última do mesmo tipo + 24 horas; motivo 'espera a vez (uma pergunta por dia)'); no limite
--      do dia da conta também esperam, em vez de cair ('espera a vez (limite do dia da conta)'). Valem 7 dias na fila
--      (os outros avisos, as horas do Admin); passou disso, ficam só no site.
--   2. Os aceites (match) que chegam juntos para a mesma pessoa: o primeiro espera os minutos de juntar do Admin (os
--      mesmos das candidaturas novas), os que chegam nesse tempo entram na mesma linha (quantos) e empurram a espera,
--      até 3 vezes esse tempo desde o primeiro. Sai uma mensagem só, pelo modelo publike_matches ("Você teve 3
--      candidaturas aceitas"); enquanto a Meta não aprova, sai pelo publike_match, com o primeiro (src/lib/servidor/
--      whatsapp.ts).
--   3. O mesmo aviso que volta ao sino com a linha ainda na fila (a pergunta repetida apaga a anterior e cria outra):
--      a linha passa a apontar para o aviso novo, em vez de cair por "já viu no Publike" com a nova de fora. O aviso
--      que saiu do sino antes de sair (apagado) fica com o motivo 'saiu do sino', e o "já viu no Publike" volta a ser só
--      o que a pessoa leu.
--
-- Pode rodar de novo.

-- 1. O gatilho: os aceites juntos e o aviso novo do sino ---------------------------------------------------------------


create or replace function privado.notificacao_para_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
  v_numero text;
  v_tipo_anuncio text;
  v_contato_direto boolean;
  v_depois timestamptz := now();
  v_ultima timestamptz;
  v_id bigint;
  v_anuncio_junto uuid;
begin
  select * into cfg from privado.config_whatsapp where id;
  if not found or not cfg.ativo or new.tipo = any (cfg.tipos_desligados) then
    return new;
  end if;
  v_numero := privado.numero_do_whatsapp(new.destinatario_id);
  if v_numero is null then
    return new;
  end if;
  if privado.aviso_desligado(new.destinatario_id, new.tipo, 'whatsapp') then
    return new;
  end if;
  -- a pessoa escolheu não receber este aviso pelo WhatsApp (Preferências)
  if exists (select 1 from privado.whatsapp_permissoes w
              where w.conta_id = new.destinatario_id and new.tipo = any (w.tipos_desligados)) then
    return new;
  end if;
  if exists (select 1 from public.perfis p where p.id = new.destinatario_id and p.suspenso_ate > now()) then
    return new;
  end if;
  if new.anuncio_id is not null then
    select a.tipo, a.contato_direto into v_tipo_anuncio, v_contato_direto from public.anuncios a where a.id = new.anuncio_id;
  end if;
  -- o match da vaga com contato direto: a curtida já vira match e a pessoa vê na tela na hora
  if new.tipo = 'match' and coalesce(v_contato_direto, false) then
    return new;
  end if;

  if new.tipo = 'curtida' then
    if v_tipo_anuncio is null or v_tipo_anuncio not in ('vaga', 'servico') then
      return new;
    end if;
    -- candidato novo na mesma vaga: junta na linha que ainda não saiu
    update privado.fila_whatsapp f set quantos = f.quantos + 1
     where f.conta_id = new.destinatario_id and f.tipo = 'curtida' and f.anuncio_id = new.anuncio_id
       and f.situacao = 'pendente'
    returning f.id into v_id;
    if v_id is not null then
      return new;
    end if;
    -- espera uns minutos para juntar e, depois de um aviso desta vaga, umas horas (Admin › WhatsApp › Parâmetros)
    select max(f.enviada_em) into v_ultima from privado.fila_whatsapp f
     where f.conta_id = new.destinatario_id and f.tipo = 'curtida' and f.anuncio_id = new.anuncio_id
       and f.enviada_em > now() - make_interval(hours => cfg.intervalo_vaga_horas);
    v_depois := greatest(now() + make_interval(mins => cfg.juntar_minutos),
                         coalesce(v_ultima + make_interval(hours => cfg.intervalo_vaga_horas), now()));
  elsif new.tipo = 'mensagem' then
    -- uma por conversa: espera uns minutos (se a pessoa vir no Publike, não sai) e, depois de um aviso, umas horas
    if exists (select 1 from privado.fila_whatsapp f
                where f.conta_id = new.destinatario_id and f.tipo = 'mensagem' and f.ator_id = new.ator_id
                  and f.situacao = 'pendente') then
      return new;
    end if;
    select max(f.enviada_em) into v_ultima from privado.fila_whatsapp f
     where f.conta_id = new.destinatario_id and f.tipo = 'mensagem' and f.ator_id = new.ator_id
       and f.enviada_em > now() - make_interval(hours => cfg.intervalo_conversa_horas);
    v_depois := greatest(now() + make_interval(mins => cfg.mensagem_minutos),
                         coalesce(v_ultima + make_interval(hours => cfg.intervalo_conversa_horas), now()));
  elsif new.tipo = 'convite' then
    -- só o convite do pacote no ar (claude/plano-ritmo-do-pacote.md): o Publike convida quem combina com a vaga. O
    -- convite de uma empresa fica no sino, no celular e no e-mail.
    if v_tipo_anuncio is distinct from 'vaga' or not exists (
         select 1 from privado.impulso_convites ic join privado.impulsos i on i.id = ic.impulso_id
          where i.anuncio_id = new.anuncio_id and ic.perfil_id = new.destinatario_id and i.situacao = 'no_ar') then
      return new;
    end if;
    -- um por pessoa e vaga
    if exists (select 1 from privado.fila_whatsapp f
                where f.conta_id = new.destinatario_id and f.tipo = 'convite' and f.anuncio_id = new.anuncio_id) then
      return new;
    end if;
  elsif new.tipo = 'match' then
    -- o aceite: só de vaga
    if v_tipo_anuncio is distinct from 'vaga' then
      return new;
    end if;
    -- outro aceite chegando junto para a mesma pessoa: entra na linha que ainda não saiu e empurra a espera (até 3
    -- vezes o tempo de juntar desde o primeiro); sai uma mensagem só. A mesma vaga de novo não conta: só passa a valer
    -- o aviso novo do sino.
    select f.id, f.anuncio_id into v_id, v_anuncio_junto
      from privado.fila_whatsapp f
     where f.conta_id = new.destinatario_id and f.tipo = 'match' and f.situacao = 'pendente'
     order by f.criado_em desc
     limit 1
     for update;
    if v_id is not null then
      if v_anuncio_junto is not distinct from new.anuncio_id then
        update privado.fila_whatsapp f set notificacao_id = new.id where f.id = v_id;
      else
        update privado.fila_whatsapp f
           set quantos = f.quantos + 1,
               enviar_depois_de = greatest(f.enviar_depois_de,
                                           least(now() + make_interval(mins => cfg.juntar_minutos),
                                                 f.criado_em + make_interval(mins => 3 * cfg.juntar_minutos)))
         where f.id = v_id;
      end if;
      return new;
    end if;
    -- o primeiro espera os minutos de juntar (os mesmos das candidaturas, em Admin › WhatsApp › Parâmetros)
    v_depois := now() + make_interval(mins => cfg.juntar_minutos);
  else
    -- as vagas: o resto só de vaga (o serviço fica no sino e no e-mail)
    if new.tipo in ('match', 'entrevista', 'entrevista_lembrete', 'dispensada', 'lembrete_curtida', 'ainda_espera',
                    'te_respondeu', 'conquista_pergunta', 'conquista_confirmar')
       and v_tipo_anuncio is distinct from 'vaga' then
      return new;
    end if;
    -- o mesmo aviso ainda na fila: não repete, mas passa a valer o aviso novo do sino (a pergunta repetida tira a
    -- anterior do sino; sem isso, a linha que espera a vez sairia descartada por "saiu do sino" e a nova nem entraria)
    update privado.fila_whatsapp f set notificacao_id = new.id
     where f.conta_id = new.destinatario_id and f.tipo = new.tipo
       and f.anuncio_id is not distinct from new.anuncio_id and f.ator_id is not distinct from new.ator_id
       and f.situacao = 'pendente';
    if found then
      return new;
    end if;
  end if;

  insert into privado.fila_whatsapp (notificacao_id, conta_id, numero, tipo, anuncio_id, ator_id, enviar_depois_de)
  values (new.id, new.destinatario_id, v_numero, new.tipo, new.anuncio_id, new.ator_id, v_depois);
  return new;
exception
  when others then
    raise warning 'Publike: notificação % não entrou na fila do WhatsApp (%).', new.id, sqlerrm;
    return new;
end
$$;


-- 2. O robô: as perguntas esperam a vez, os aceites juntos e o motivo de quem saiu do sino -----------------------------
-- O mesmo de 20270714120000, com as trocas de cima.

create or replace function public.servidor_whatsapp_pegar(p_chave text, p_limite integer default 30)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
  v_hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
  v_saidas integer;
  v_folga integer;
  v_teste text[];
  v_limite_conta integer;
  v_pessoa boolean;
  v_plano boolean;
  v_limite_mes integer;
  r record;
  v_itens jsonb := '[]'::jsonb;
  v_n integer := 0;
  v_ultima timestamptz;
  v_enviando boolean;
  v_na_conta integer;
  v_primeira timestamptz;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_whatsapp where id;
  if not found or not cfg.ativo then
    return jsonb_build_object('ativo', false, 'itens', '[]'::jsonb);
  end if;

  -- o que ficou "enviando" (o robô caiu no meio): não manda de novo, para não repetir
  update privado.fila_whatsapp f set situacao = 'falhou', motivo = 'sem confirmação do envio'
   where f.situacao = 'enviando' and f.enviando_em < now() - interval '15 minutes';
  -- o aviso que esperou demais já não serve (um dia, se o Admin não mudou); as perguntas de retorno esperam a vez
  -- (uma de cada por pessoa por dia) e valem 7 dias
  update privado.fila_whatsapp f
     set situacao = 'descartada',
         motivo = case when f.tipo in ('te_respondeu', 'conquista_pergunta') then 'venceu (mais de 7 dias esperando a vez)'
                       when cfg.validade_horas = 24 then 'venceu (mais de um dia na fila)'
                       else format('venceu (mais de %s horas na fila)', cfg.validade_horas) end
   where f.situacao = 'pendente'
     and f.criado_em < now() - case when f.tipo in ('te_respondeu', 'conquista_pergunta') then interval '7 days'
                                    else make_interval(hours => cfg.validade_horas) end;
  -- a fila guarda 90 dias (os números do Admin usam 30); a resposta automática, 2 dias
  delete from privado.fila_whatsapp f where f.criado_em < now() - interval '90 days';
  delete from privado.whatsapp_respostas_auto ra where ra.em < now() - interval '2 days';

  -- só no horário do Admin (das 8h às 21h, se ninguém mudou; hora de Goiânia)
  if v_hora < cfg.hora_inicio or v_hora >= cfg.hora_fim then
    return jsonb_build_object('ativo', true, 'fora_do_horario', true, 'itens', '[]'::jsonb);
  end if;

  select count(*) into v_saidas from privado.fila_whatsapp f
   where f.enviada_em > now() - interval '24 hours';
  v_folga := greatest(cfg.limite_dia - v_saidas, 0);
  if v_folga = 0 then
    return jsonb_build_object('ativo', true, 'limite_do_dia', true, 'itens', '[]'::jsonb);
  end if;
  -- o limite do mês (o teto do gasto): conta do dia 1 deste mês, no horário de Goiânia
  select count(*) into v_saidas from privado.fila_whatsapp f
   where f.enviada_em >= privado.whatsapp_inicio_do_mes();
  v_folga := least(v_folga, greatest(cfg.limite_mes - v_saidas, 0));
  if v_folga = 0 then
    return jsonb_build_object('ativo', true, 'limite_do_mes', true, 'itens', '[]'::jsonb);
  end if;
  select coalesce(array_agg(privado.chave_do_numero(n)), '{}') into v_teste from unnest(cfg.numeros_teste) n;

  -- o mais importante primeiro (quando a conta chega no limite do dia, o que fica de fora é o de menos); no empate,
  -- o mais antigo (as perguntas que esperam a vez voltam juntas no dia seguinte)
  for r in
    select f.*
      from privado.fila_whatsapp f
     where f.situacao = 'pendente' and f.enviar_depois_de <= now()
     order by case when f.tipo in ('entrevista_lembrete', 'entrevista', 'match') then 1
                   when f.tipo in ('lembrete_curtida', 'dispensada', 'mensagem') then 3
                   else 2 end,
              f.enviar_depois_de, f.criado_em, f.id
     limit least(greatest(coalesce(p_limite, 30), 1), 100)
     for update skip locked
  loop
    -- o modo de teste: só os números da lista
    if not cfg.para_todos and not (privado.chave_do_numero(r.numero) = any (v_teste)) then
      update privado.fila_whatsapp set situacao = 'descartada', motivo = 'modo de teste' where id = r.id;
      continue;
    end if;
    -- parou depois de entrar na fila
    if privado.numero_do_whatsapp(r.conta_id) is null then
      update privado.fila_whatsapp set situacao = 'descartada', motivo = 'parou de receber' where id = r.id;
      continue;
    end if;
    -- desligou este aviso depois de ele entrar na fila
    if exists (select 1 from privado.whatsapp_permissoes w where w.conta_id = r.conta_id and r.tipo = any (w.tipos_desligados)) then
      update privado.fila_whatsapp set situacao = 'descartada', motivo = 'desligou este aviso' where id = r.id;
      continue;
    end if;
    -- já viu no Publike (ou o aviso saiu do sino): não precisa do WhatsApp
    if r.tipo = 'curtida' then
      if not exists (select 1 from public.notificacoes n
                      where n.destinatario_id = r.conta_id and n.tipo = 'curtida' and n.anuncio_id = r.anuncio_id
                        and not n.lida and n.criado_em >= r.criado_em - interval '1 minute') then
        update privado.fila_whatsapp set situacao = 'descartada', motivo = 'já viu no Publike' where id = r.id;
        continue;
      end if;
    elsif r.tipo = 'match' and r.quantos > 1 then
      -- os aceites juntos: só não sai se a pessoa viu todos no Publike
      if not exists (select 1 from public.notificacoes n
                      where n.destinatario_id = r.conta_id and n.tipo = 'match'
                        and not n.lida and n.criado_em >= r.criado_em - interval '1 minute') then
        update privado.fila_whatsapp set situacao = 'descartada', motivo = 'já viu no Publike' where id = r.id;
        continue;
      end if;
    elsif r.notificacao_id is not null
          and not exists (select 1 from public.notificacoes n where n.id = r.notificacao_id and not n.lida) then
      -- lido no Publike, ou apagado do sino (trocado por um mais novo, como a pergunta repetida)
      update privado.fila_whatsapp
         set situacao = 'descartada',
             motivo = case when exists (select 1 from public.notificacoes n where n.id = r.notificacao_id)
                           then 'já viu no Publike' else 'saiu do sino' end
       where id = r.id;
      continue;
    end if;
    v_pessoa := exists (select 1 from public.perfis p where p.id = r.conta_id and p.tipo = 'pessoa');
    -- quem contrata: o limite do mês, o do grátis ou o do plano (30 e 300, se o Admin não mudou)
    if not v_pessoa then
      v_plano := privado.whatsapp_com_plano(r.conta_id);
      v_limite_mes := case when v_plano then cfg.limite_mes_plano else cfg.limite_mes_gratis end;
      if privado.whatsapp_usadas_no_mes(r.conta_id) >= v_limite_mes then
        update privado.fila_whatsapp
           set situacao = 'descartada',
               motivo = case when v_plano then 'limite do mês do plano' else 'limite do mês do grátis' end
         where id = r.id;
        perform privado.avisar_limite_do_whatsapp(r.conta_id, v_plano, v_limite_mes);
        continue;
      end if;
    end if;
    -- as perguntas de retorno ("A empresa te respondeu?", "Deu certo?"): no máximo uma de cada por pessoa por dia, a
    -- mais antiga primeiro (a ordem da fila); as outras esperam a vez, com os mesmos botões
    if r.tipo in ('te_respondeu', 'conquista_pergunta') then
      select max(f.enviada_em), coalesce(bool_or(f.situacao = 'enviando'), false) into v_ultima, v_enviando
        from privado.fila_whatsapp f
       where f.conta_id = r.conta_id and f.tipo = r.tipo and f.id <> r.id
         and (f.enviada_em > now() - interval '24 hours' or f.situacao = 'enviando');
      if v_ultima is not null or v_enviando then
        update privado.fila_whatsapp
           set enviar_depois_de = greatest(coalesce(v_ultima, now()) + interval '24 hours', now() + interval '1 minute'),
               motivo = 'espera a vez (uma pergunta por dia)'
         where id = r.id;
        continue;
      end if;
    end if;
    -- até N por conta por dia (quem contrata tem o próprio limite, maior: os candidatos de várias vagas); a pergunta de
    -- retorno não cai: espera a vez que abre no limite
    v_limite_conta := case when v_pessoa then cfg.por_conta_dia else cfg.por_conta_dia_empresa end;
    select count(*), min(f.enviada_em) into v_na_conta, v_primeira
      from privado.fila_whatsapp f
     where f.conta_id = r.conta_id
       and (f.enviada_em > now() - interval '24 hours' or f.situacao = 'enviando');
    if v_na_conta >= v_limite_conta then
      if r.tipo in ('te_respondeu', 'conquista_pergunta') then
        update privado.fila_whatsapp
           set enviar_depois_de = greatest(coalesce(v_primeira, now()) + interval '24 hours', now() + interval '1 minute'),
               motivo = 'espera a vez (limite do dia da conta)'
         where id = r.id;
      else
        update privado.fila_whatsapp set situacao = 'descartada', motivo = 'limite do dia da conta' where id = r.id;
      end if;
      continue;
    end if;
    exit when v_n >= v_folga;

    update privado.fila_whatsapp
       set situacao = 'enviando', enviando_em = now(), tentativas = tentativas + 1
     where id = r.id;
    v_n := v_n + 1;
    v_itens := v_itens || jsonb_build_object(
      'id', r.id,
      'tipo', r.tipo,
      'conta_id', r.conta_id,
      'numero', r.numero,
      'quantos', r.quantos,
      'anuncio_id', r.anuncio_id,
      'ator_id', r.ator_id,
      'tentativas', r.tentativas + 1,
      'aviso', (select jsonb_build_object('tipo', n.tipo, 'link', n.link, 'recado_id', n.recado_id, 'texto', n.texto)
                  from public.notificacoes n where n.id = r.notificacao_id),
      'dados', (
        select jsonb_build_object(
          'nome', privado.nome_para_email(r.conta_id),
          'conta_tipo', pc.tipo,
          'vaga', a.titulo,
          'anuncio_tipo', a.tipo,
          'empresa', case when a.id is null then null
                          when a.contratante_confidencial then 'A empresa'
                          else coalesce(nullif(btrim(a.contratante), ''), pa.nome, 'A empresa') end,
          'ator', privado.nome_da_conquista(pt.nome),
          'esperando', case when r.tipo = 'lembrete_curtida' then
                         (select count(*) from public.curtidas c
                           where c.anuncio_id = r.anuncio_id and c.status = 'pendente' and c.aceita_em is null) end,
          'entrevista', case when r.tipo in ('entrevista', 'entrevista_lembrete') then
                          (select jsonb_build_object('quando', e.quando, 'formato', e.formato, 'local', e.local,
                                                     'situacao', e.situacao)
                             from public.entrevistas e
                            where e.anuncio_id = r.anuncio_id and e.perfil_id = r.conta_id
                            order by e.atualizado_em desc limit 1) end)
          from public.perfis pc
          left join public.anuncios a on a.id = r.anuncio_id
          left join public.perfis pa on pa.id = a.autor_id
          left join public.perfis pt on pt.id = r.ator_id
         where pc.id = r.conta_id));
  end loop;
  return jsonb_build_object('ativo', true, 'itens', v_itens);
end
$$;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270804120000_whatsapp_uma_pergunta_por_dia');
