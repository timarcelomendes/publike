-- Mais alcance pelo WhatsApp (18/11/2026). Pedido do Marcelo: "precisamos alcancar mais pessoas"; escolheu "Pedir no
-- currículo" e "Pedir a quem publica"; sobre o convite do pacote pelo WhatsApp, "Boa ideia, se converter.. o custo
-- compensa". Só 28 contas tinham aceitado o WhatsApp (26 de 377 pessoas; 2 das 76 contas com vaga no ar).
--
--   1. O aceite ganha duas origens: 'curriculo' (a página do currículo, para quem ainda não aceitou) e 'painel' (o Hoje
--      de quem contrata com vaga no ar). Depois de publicar ('publicar') já perguntava desde 17/11.
--   2. O convite do pacote vai também pelo WhatsApp (o modelo publike_vaga_que_combina, de marketing, cadastrado sozinho
--      pelo robô): só o convite que o pacote fez (privado.impulso_convites), para quem aceitou e não desligou o aviso,
--      com os limites de sempre (das 8h às 21h, por conta por dia, o do mês). O convite de uma empresa não vai.
--   3. Quem aceitou antes desta migração aceitou receber o andamento das candidaturas, não vagas sugeridas: para essas
--      contas, o convite pelo WhatsApp começa desligado (ligam em Preferências). Os aceites novos já dizem "e vagas que
--      combinam com você" (o currículo, o Curtir, Preferências e o cadastro), e quem tinha cancelado e volta a aceitar
--      por um desses textos passa a receber. Uma vez só: rodar de novo não desliga de novo quem ligou.
--   4. Admin: o custo estimado conta cada mensagem pela categoria do modelo (marketing custa mais), e o convite do
--      pacote mostra quantos saíram pelo WhatsApp e quantos curtiram.
-- Pode rodar de novo.

-- 1. as origens do aceite
alter table privado.whatsapp_permissoes drop constraint if exists whatsapp_permissoes_origem_check;
alter table privado.whatsapp_permissoes add constraint whatsapp_permissoes_origem_check
  check (origem in ('avisos', 'curtir', 'quadro', 'cadastro', 'publicar', 'curriculo', 'painel'));

create or replace function public.mudar_whatsapp(p_aceito boolean, p_origem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v_numero text;
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta escolhe os avisos.' using errcode = '42501';
  end if;
  if coalesce(p_origem, '') not in ('avisos', 'curtir', 'quadro', 'cadastro', 'publicar', 'curriculo', 'painel') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  if not coalesce(p_aceito, false) then
    update privado.whatsapp_permissoes set cancelado_em = now() where conta_id = conta and cancelado_em is null;
    return;
  end if;
  select c.whatsapp into v_numero from public.contatos c where c.perfil_id = conta;
  if v_numero is null then
    raise exception 'Ponha o seu WhatsApp no perfil primeiro.' using errcode = 'P0001', hint = 'sem_numero';
  end if;
  insert into privado.whatsapp_permissoes as w (conta_id, numero, origem, aceito_em, cancelado_em)
  values (conta, v_numero, p_origem, now(), null)
  on conflict (conta_id) do update
    set numero = excluded.numero, origem = excluded.origem, aceito_em = now(), cancelado_em = null,
        -- quem tinha cancelado e volta a aceitar por um texto que fala das vagas que combinam (o currículo, o Curtir,
        -- Preferências e o cadastro de quem procura trabalho) passa a receber o convite do pacote
        tipos_desligados = case
          when w.cancelado_em is not null and excluded.origem in ('curriculo', 'curtir', 'avisos', 'cadastro')
            then array_remove(w.tipos_desligados, 'convite')
          else w.tipos_desligados
        end;
end
$$;

-- o convite entra nos avisos que cada conta escolhe em Preferências
alter table privado.whatsapp_permissoes drop constraint if exists whatsapp_permissoes_tipos_desligados_check;
alter table privado.whatsapp_permissoes add constraint whatsapp_permissoes_tipos_desligados_check
  check (tipos_desligados <@ array['match', 'entrevista', 'entrevista_lembrete', 'te_respondeu', 'conquista_pergunta', 'dispensada', 'curtida', 'lembrete_curtida', 'ainda_espera', 'conquista_confirmar', 'interesse_local', 'mensagem', 'convite']::text[]);

create or replace function public.mudar_whatsapp_avisos(p_desligados text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta escolhe os avisos.' using errcode = '42501';
  end if;
  update privado.whatsapp_permissoes w
     set tipos_desligados = coalesce((select array_agg(distinct t order by t) from unnest(coalesce(p_desligados, '{}')) t
                                       where t = any (array['match', 'entrevista', 'entrevista_lembrete', 'te_respondeu', 'conquista_pergunta', 'dispensada', 'curtida', 'lembrete_curtida', 'ainda_espera', 'conquista_confirmar', 'interesse_local', 'mensagem', 'convite']::text[])), '{}')
   where w.conta_id = conta and w.cancelado_em is null;
  if not found then
    raise exception 'Ligue o WhatsApp primeiro.' using errcode = 'P0001', hint = 'sem_whatsapp';
  end if;
end
$$;
revoke execute on function public.mudar_whatsapp_avisos(text[]) from public, anon;
grant execute on function public.mudar_whatsapp_avisos(text[]) to authenticated;

-- 3. quem aceitou antes: o convite pelo WhatsApp desligado (só na primeira vez que esta migração roda)
update privado.whatsapp_permissoes
   set tipos_desligados = array_append(coalesce(tipos_desligados, '{}'::text[]), 'convite')
 where not ('convite' = any (coalesce(tipos_desligados, '{}'::text[])))
   and not exists (select 1 from privado.migracoes_aplicadas m where m.nome = '20270718120000_whatsapp_mais_alcance');

-- 2. o convite do pacote entra na fila do WhatsApp
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
  v_depois timestamptz := now();
  v_ultima timestamptz;
  v_id bigint;
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
    select a.tipo into v_tipo_anuncio from public.anuncios a where a.id = new.anuncio_id;
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
  else
    -- as vagas: o resto só de vaga (o serviço fica no sino e no e-mail)
    if new.tipo in ('match', 'entrevista', 'entrevista_lembrete', 'dispensada', 'lembrete_curtida', 'ainda_espera',
                    'te_respondeu', 'conquista_pergunta', 'conquista_confirmar')
       and v_tipo_anuncio is distinct from 'vaga' then
      return new;
    end if;
    -- o mesmo aviso ainda na fila: não repete
    if exists (select 1 from privado.fila_whatsapp f
                where f.conta_id = new.destinatario_id and f.tipo = new.tipo
                  and f.anuncio_id is not distinct from new.anuncio_id and f.ator_id is not distinct from new.ator_id
                  and f.situacao = 'pendente') then
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

drop trigger if exists notificacoes_para_whatsapp on public.notificacoes;
create trigger notificacoes_para_whatsapp
after insert on public.notificacoes
for each row
when (new.tipo in ('match', 'entrevista', 'entrevista_lembrete', 'te_respondeu', 'conquista_pergunta', 'dispensada',
                   'curtida', 'lembrete_curtida', 'ainda_espera', 'conquista_confirmar', 'interesse_local', 'mensagem',
                   'convite'))
execute function privado.notificacao_para_whatsapp();

-- 4. o custo por modelo (a categoria de cada um fica em config_whatsapp.modelos) e o convite pelo WhatsApp no Admin
create or replace function public.admin_whatsapp_cobradas_por_modelo(p_dias integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike vê o WhatsApp.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(x.modelo, x.n)
      from (select coalesce(f.modelo, '?') as modelo, count(*) as n from privado.fila_whatsapp f
             where f.cobrada and f.criado_em > now() - make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 400))
             group by 1) x), '{}'::jsonb);
end
$$;

create or replace function public.admin_convite_do_pacote()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
begin
  perform privado.exigir_impulsos_admin();
  select * into c from privado.config_impulso where id;
  return jsonb_build_object(
    'ligado', coalesce(c.convite_ligado, false),
    'maximo', coalesce(c.convite_max, 30),
    'rodou_em', c.convite_rodou_em,
    'hora_inicio', c.convite_hora_inicio,
    'hora_fim', c.convite_hora_fim,
    'pacotes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'impulso_id', i.id, 'titulo', i.titulo, 'no_ar', i.situacao = 'no_ar',
               'cliente', (select p.nome from public.perfis p where p.id = i.conta_id),
               'alvo', i.alvo, 'entregues', privado.pacote_entregues(i.id),
               'convidados', (select count(*) from privado.impulso_convites ic where ic.impulso_id = i.id),
               'curtiram', (select count(*) from privado.impulso_curtidas k
                             join public.curtidas cu on cu.anuncio_id = i.anuncio_id and cu.perfil_id = k.perfil_id
                            where k.impulso_id = i.id and k.origem = 'convite'),
               -- o convite pelo WhatsApp (migração 20270718120000): quantos saíram e, desses, quantos curtiram
               'whatsapp', (select count(*) from privado.fila_whatsapp f
                             where f.tipo = 'convite' and f.anuncio_id = i.anuncio_id and f.enviada_em is not null
                               and exists (select 1 from privado.impulso_convites ic
                                            where ic.impulso_id = i.id and ic.perfil_id = f.conta_id)),
               'whatsapp_curtiram', (select count(*) from privado.fila_whatsapp f
                             join public.curtidas cu on cu.anuncio_id = f.anuncio_id and cu.perfil_id = f.conta_id
                             where f.tipo = 'convite' and f.anuncio_id = i.anuncio_id and f.enviada_em is not null
                               and cu.criado_em >= f.enviada_em
                               and exists (select 1 from privado.impulso_convites ic
                                            where ic.impulso_id = i.id and ic.perfil_id = f.conta_id)))
             order by i.situacao <> 'no_ar', i.aprovado_em)
        from privado.impulsos i
       -- os no ar e, para o resultado do piloto, os que terminaram nos últimos 30 dias depois de convidar alguém
       where i.produto = 'candidatos'
         and (i.situacao = 'no_ar'
              or (i.encerrado_em > now() - interval '30 days'
                  and exists (select 1 from privado.impulso_convites ic where ic.impulso_id = i.id)))), '[]'::jsonb));
end
$$;

revoke execute on function public.admin_whatsapp_cobradas_por_modelo(integer) from public;
grant execute on function public.admin_whatsapp_cobradas_por_modelo(integer) to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270718120000_whatsapp_mais_alcance');
