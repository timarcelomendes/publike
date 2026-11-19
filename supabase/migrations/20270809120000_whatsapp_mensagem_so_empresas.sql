-- A mensagem nova no chat pelo WhatsApp, só para quem contrata (19/11/2026; Marcelo: "só tem candidatos, não tem
-- disparo pra empresas?" e "concordo" com ligar o aviso da mensagem nova para as empresas). O aviso 'mensagem' ia para
-- os dois lados e estava desligado em Admin › WhatsApp; agora só sai para empresa, comércio e agência (quem precisa
-- responder o candidato rápido). A mesma função de 20270804120000; só o trecho da 'mensagem' muda. Ligar o aviso
-- continua em Admin › WhatsApp (os tipos).
--
-- Pode rodar de novo.

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
    -- só para quem contrata (empresa, comércio, agência): é quem precisa responder rápido (migração 20270809120000)
    if not exists (select 1 from public.perfis p
                    where p.id = new.destinatario_id and p.tipo in ('empresa', 'comercio', 'agencia')) then
      return new;
    end if;
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


notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270809120000_whatsapp_mensagem_so_empresas');
