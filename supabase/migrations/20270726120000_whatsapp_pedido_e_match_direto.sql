-- O WhatsApp de quem contrata e o match do contato direto (18/11/2026). Pedidos do Marcelo:
--
--   1. "o envio via whatsapp para o candidato só deve ocorrer para situações onde a vaga não tem contato direto [...]
--      ele já viu na tela que houve match" → "tirar": em vaga com contato direto a curtida já vira match e a pessoa vê
--      na hora, então o match não vai pelo WhatsApp (nos 30 dias até 18/11, os 20 matches que entraram na fila do
--      WhatsApp eram todos de vaga com contato direto). O match que a empresa dá depois, nas vagas sem contato
--      direto, continua indo. A empresa segue recebendo a curtida.
--   2. "habilitar [o WhatsApp] para todas empresas e agências [...] e dar a mensagem para elas, se quiser desabilitar"
--      → "pedir": a Meta só deixa mandar para quem aceitou antes (o aceite diz que é pelo WhatsApp e o nome de quem
--      manda), então cada conta que contrata e ainda não respondeu recebe, uma vez, no sino e por e-mail, o pedido
--      "Receber os candidatos no WhatsApp?" com o link de um toque, sem entrar: /avisos/whatsapp/<token>. A página
--      pede o toque (leitores de link abrem o endereço sozinhos) e o aceite fica com a origem 'email'. Sai quando a
--      equipe toca em "Pedir" em Admin › WhatsApp › Pedir o aceite. Em 18/11, 2 das 89 contas que contratam tinham
--      aceitado.
--
-- Pode rodar de novo.

-- 1. O match do contato direto fica fora do WhatsApp -------------------------------------------------------------------

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

-- 2. O pedido do aceite a quem contrata ----------------------------------------------------------------------------

alter table privado.whatsapp_permissoes drop constraint if exists whatsapp_permissoes_origem_check;
alter table privado.whatsapp_permissoes add constraint whatsapp_permissoes_origem_check
  check (origem in ('avisos', 'curtir', 'quadro', 'cadastro', 'publicar', 'curriculo', 'painel', 'email'));

-- um pedido por conta: o token do link (no sino e no e-mail), quando abriu e quando aceitou
create table if not exists privado.whatsapp_pedidos (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  pedido_em timestamptz not null default now(),
  pedido_por uuid references auth.users (id) on delete set null,
  abriu_em timestamptz,
  aceitou_em timestamptz
);
alter table privado.whatsapp_pedidos enable row level security;
revoke all on table privado.whatsapp_pedidos from public, anon, authenticated;

-- o número sem mostrar tudo: (62) 9••••-1234
create or replace function privado.whatsapp_mascarado(p_numero text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_numero ~ '^55[1-9][0-9][0-9]{8,9}$' then
    '(' || substr(p_numero, 3, 2) || ') ' || substr(p_numero, 5, 1) || repeat('•', char_length(p_numero) - 9)
      || '-' || right(p_numero, 4)
  end
$$;
revoke all on function privado.whatsapp_mascarado(text) from public;

-- o texto do sino (o mesmo na prévia do Admin)
create or replace function privado.whatsapp_pedido_texto(p_numero_mascarado text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Quer receber os candidatos no WhatsApp? Quando alguém curtir as suas vagas, o Publike avisa no '
         || coalesce(p_numero_mascarado, 'seu WhatsApp')
         || '. Toque para ligar; dá para desligar quando quiser em Preferências.'
$$;
revoke all on function privado.whatsapp_pedido_texto(text) from public;

-- quem pode receber o pedido: as contas que contratam (empresa, comércio, agência), com o WhatsApp no perfil, que
-- nunca responderam (nem aceitaram nem cancelaram) e ainda não receberam o pedido
create or replace function privado.whatsapp_pedido_candidatos()
returns table (conta_id uuid, nome text, tipo text, numero text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nome, p.tipo, c.whatsapp
    from public.perfis p
    join public.contatos c on c.perfil_id = p.id
   where p.tipo <> 'pessoa'
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and c.whatsapp ~ '^55[1-9][0-9][0-9]{8,9}$'
     and not exists (select 1 from privado.whatsapp_permissoes w where w.conta_id = p.id)
     and not exists (select 1 from privado.whatsapp_pedidos x where x.conta_id = p.id)
$$;
revoke all on function privado.whatsapp_pedido_candidatos() from public;

-- o e-mail do pedido (o texto muda em Admin › E-mails › Textos)
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('whatsapp_pedido', 'usuarios', 61, 'Receber os candidatos no WhatsApp',
     'Para quem contrata e ainda não aceitou o WhatsApp: o pedido, com o botão que liga os avisos num toque, sem entrar. '
       || 'Sai uma vez por conta, quando a equipe toca em "Pedir" em Admin › WhatsApp › Pedir o aceite.',
     array['nome', 'empresa', 'numero', 'link'],
     'Quer receber os candidatos no WhatsApp?',
     E'Oi, {{nome}}.\n\nQuando alguém curtir as vagas da {{empresa}}, o Publike pode avisar na hora pelo WhatsApp, no '
       || E'número {{numero}}. Assim vocês respondem antes de o candidato procurar outra vaga.\n\nPara ligar, é só '
       || E'tocar no botão e confirmar. Vocês escolhem quais avisos recebem e desligam quando quiserem em Preferências.',
     'Sim, quero receber')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do update
  set nome = excluded.nome, descricao = excluded.descricao, variaveis = excluded.variaveis,
      assunto = case when modelos_email.assunto = modelos_email.assunto_padrao then excluded.assunto
                     else modelos_email.assunto end,
      corpo = case when modelos_email.corpo = modelos_email.corpo_padrao then excluded.corpo
                   else modelos_email.corpo end,
      botao = case when modelos_email.botao = modelos_email.botao_padrao then excluded.botao
                   else modelos_email.botao end,
      assunto_padrao = excluded.assunto_padrao, corpo_padrao = excluded.corpo_padrao,
      botao_padrao = excluded.botao_padrao;

-- Admin › WhatsApp › Pedir o aceite: os números, a prévia do sino e os últimos (pelo nome, nunca o número)
create or replace function public.admin_whatsapp_pedidos()
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
    'contas', (select count(*) from public.perfis p
                where p.tipo <> 'pessoa' and (p.suspenso_ate is null or p.suspenso_ate < now())),
    'aceitaram', (select count(*) from privado.whatsapp_permissoes w join public.perfis p on p.id = w.conta_id
                   where p.tipo <> 'pessoa' and w.cancelado_em is null),
    'cancelaram', (select count(*) from privado.whatsapp_permissoes w join public.perfis p on p.id = w.conta_id
                    where p.tipo <> 'pessoa' and w.cancelado_em is not null),
    'sem_numero', (select count(*) from public.perfis p
                     left join public.contatos c on c.perfil_id = p.id
                    where p.tipo <> 'pessoa' and (p.suspenso_ate is null or p.suspenso_ate < now())
                      and coalesce(c.whatsapp, '') !~ '^55[1-9][0-9][0-9]{8,9}$'
                      and not exists (select 1 from privado.whatsapp_permissoes w where w.conta_id = p.id)),
    'para_pedir', (select count(*) from privado.whatsapp_pedido_candidatos()),
    'para_pedir_por_tipo', coalesce((select jsonb_object_agg(t.tipo, t.n)
                                       from (select x.tipo, count(*) as n from privado.whatsapp_pedido_candidatos() x
                                              group by x.tipo) t), '{}'::jsonb),
    'pedidos', (select count(*) from privado.whatsapp_pedidos),
    'abriram', (select count(*) from privado.whatsapp_pedidos x where x.abriu_em is not null),
    'aceitaram_pelo_pedido', (select count(*) from privado.whatsapp_pedidos x where x.aceitou_em is not null),
    'ultimo_pedido', (select max(x.pedido_em) from privado.whatsapp_pedidos x),
    'texto_sino', privado.whatsapp_pedido_texto('(62) 9••••-1234'),
    -- o texto do e-mail, para a prévia (Admin › E-mails só abre no computador do dono)
    'email', (select jsonb_build_object('grupo', m.grupo, 'assunto', m.assunto, 'corpo', m.corpo, 'botao', m.botao)
                from public.modelos_email m where m.chave = 'whatsapp_pedido'),
    'ultimos', coalesce((select jsonb_agg(jsonb_build_object(
                                  'nome', u.nome, 'tipo', u.tipo, 'pedido_em', u.pedido_em, 'abriu_em', u.abriu_em,
                                  'aceitou_em', u.aceitou_em) order by u.quando desc)
                           from (select p.nome, p.tipo, x.pedido_em, x.abriu_em, x.aceitou_em,
                                        coalesce(x.aceitou_em, x.abriu_em, x.pedido_em) as quando
                                   from privado.whatsapp_pedidos x
                                   join public.perfis p on p.id = x.conta_id
                                  order by coalesce(x.aceitou_em, x.abriu_em, x.pedido_em) desc
                                  limit 30) u), '[]'::jsonb));
end
$$;
revoke execute on function public.admin_whatsapp_pedidos() from public, anon;
grant execute on function public.admin_whatsapp_pedidos() to authenticated, service_role;

-- o "Pedir": para cada conta que ainda não recebeu, o sino e o e-mail, com o link de um toque
create or replace function public.admin_whatsapp_pedir_aceite()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_token text;
  v_mascarado text;
  v_n integer := 0;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  for r in select * from privado.whatsapp_pedido_candidatos() loop
    v_token := null;
    insert into privado.whatsapp_pedidos (conta_id, pedido_por) values (r.conta_id, auth.uid())
    on conflict (conta_id) do nothing
    returning token into v_token;
    if v_token is null then
      continue;
    end if;
    v_mascarado := privado.whatsapp_mascarado(r.numero);
    insert into public.notificacoes (destinatario_id, tipo, texto, link)
    values (r.conta_id, 'comunicado', privado.whatsapp_pedido_texto(v_mascarado), '/avisos/whatsapp/' || v_token);
    perform privado.enfileirar_email(r.conta_id, 'whatsapp_pedido', jsonb_build_object(
      'caminho', '/avisos/whatsapp/' || v_token,
      'empresa', coalesce(nullif(btrim(r.nome), ''), 'sua empresa'),
      'numero', v_mascarado));
    v_n := v_n + 1;
  end loop;
  perform privado.registrar('whatsapp_pedir_aceite', 'config', null, 'Pedido do aceite do WhatsApp',
                            jsonb_build_object('contas', v_n));
  return v_n;
end
$$;
revoke execute on function public.admin_whatsapp_pedir_aceite() from public, anon;
grant execute on function public.admin_whatsapp_pedir_aceite() to authenticated, service_role;

-- A página do link (sem entrar): abrir só marca que abriu; o aceite é o toque no botão --------------------------------

create or replace function public.whatsapp_pedido_ver(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pedido privado.whatsapp_pedidos;
  v_nome text;
  v_numero text;
  v_ativo boolean;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into v_pedido from privado.whatsapp_pedidos x where x.token = p_token;
  if not found then
    return null;
  end if;
  if v_pedido.abriu_em is null then
    update privado.whatsapp_pedidos set abriu_em = now() where conta_id = v_pedido.conta_id;
  end if;
  select p.nome into v_nome from public.perfis p where p.id = v_pedido.conta_id;
  select c.whatsapp into v_numero from public.contatos c where c.perfil_id = v_pedido.conta_id;
  select w.cancelado_em is null into v_ativo from privado.whatsapp_permissoes w where w.conta_id = v_pedido.conta_id;
  return jsonb_build_object(
    'empresa', coalesce(nullif(btrim(v_nome), ''), 'sua empresa'),
    'numero', privado.whatsapp_mascarado(v_numero),
    'aceito', coalesce(v_ativo, false));
end
$$;
revoke execute on function public.whatsapp_pedido_ver(text) from public;
grant execute on function public.whatsapp_pedido_ver(text) to anon, authenticated, service_role;

create or replace function public.whatsapp_pedido_aceitar(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pedido privado.whatsapp_pedidos;
  v_numero text;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Este link não vale mais.' using errcode = '22023';
  end if;
  select * into v_pedido from privado.whatsapp_pedidos x where x.token = p_token for update;
  if not found then
    raise exception 'Este link não vale mais.' using errcode = '22023';
  end if;
  select c.whatsapp into v_numero from public.contatos c where c.perfil_id = v_pedido.conta_id;
  if coalesce(v_numero, '') !~ '^55[1-9][0-9][0-9]{8,9}$' then
    raise exception 'A conta está sem WhatsApp no perfil. Entre no Publike e ponha o número no perfil.'
      using errcode = 'P0001', hint = 'sem_numero';
  end if;
  -- quem já recebe continua como está; quem tinha desligado e toca aqui volta a receber
  insert into privado.whatsapp_permissoes as w (conta_id, numero, origem, aceito_em, cancelado_em)
  values (v_pedido.conta_id, v_numero, 'email', now(), null)
  on conflict (conta_id) do update
    set numero = excluded.numero, origem = excluded.origem, aceito_em = now(), cancelado_em = null
    where w.cancelado_em is not null;
  update privado.whatsapp_pedidos
     set aceitou_em = coalesce(aceitou_em, now()), abriu_em = coalesce(abriu_em, now())
   where conta_id = v_pedido.conta_id;
  return jsonb_build_object('numero', privado.whatsapp_mascarado(v_numero));
end
$$;
revoke execute on function public.whatsapp_pedido_aceitar(text) from public;
grant execute on function public.whatsapp_pedido_aceitar(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270726120000_whatsapp_pedido_e_match_direto');
