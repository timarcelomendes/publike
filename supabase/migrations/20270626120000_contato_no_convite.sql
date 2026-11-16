-- O contato dos talentos no convite (16/11/2026, Marcelo: "acho que a empresa pode sempre ter acesso ao contato dos
-- talentos, quando conectar" e "envia convite e já abre opção premium de enviar mensagem: chat Publike, WhatsApp e
-- e-mail"). O grátis continua igual: pedir conexão e, no aceite, os contatos dos dois e a conversa. Nos planos (o
-- Completo e os por faixa, que liberam tudo, ou a cortesia da agência), a empresa, comércio ou agência que pede
-- conexão a um talento já vê o WhatsApp, o e-mail, o nome inteiro e a foto dele, e a conversa no Publike abre na hora,
-- sem esperar o aceite. O talento vê o contato da empresa também e recebe o aviso.
--   * Só de quem deixou as empresas encontrarem o currículo; o talento escolhe em "Quem vê seu currículo".
--   * Quem já estava no Publike recebe hoje o aviso no sino, com "Liberar agora" e "Não liberar" (Marcelo: "dar ao
--     usuário a opção de liberar o acesso, no aviso do sino, assim ele mesmo pode ter interesse"); sem escolha, vale
--     7 dias depois (23/11). Quem deixar o currículo visível depois do aviso já entra no combinado novo (leu o texto
--     novo). Com `vale_em` null, quem já estava só entra se liberar.
--   * 15 dias grátis para testar, uma vez por conta, com até 5 contatos por dia; no plano, até 30 por dia (o mesmo
--     limite dos pedidos de conexão).
--   * Recusou: a conversa fecha, como antes; o que a empresa já viu não volta.
-- Pode rodar de novo.

-- 1. O que fica guardado -----------------------------------------------------------------------------------------------

alter table public.conexoes add column if not exists contato_liberado_em timestamptz;
comment on column public.conexoes.contato_liberado_em is
  'Pedido de empresa com plano (ou nos 15 dias grátis): o contato do talento apareceu no convite, antes do aceite.';

-- a escolha de quem procura trabalho: true (liberou o contato no convite) ou false (só depois de aceitar)
create table if not exists privado.contato_no_convite_escolha (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  mostrar boolean not null,
  em timestamptz not null default now()
);

-- os 15 dias grátis (a linha fica depois do fim, para não repetir); `ate` null: liberado sem prazo pelo Admin
create table if not exists privado.contato_no_convite_contas (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  inicio timestamptz not null default now(),
  ate timestamptz,
  -- quem da conta tocou em "Testar 15 dias grátis" (na agência, alguém da equipe)
  pessoa_id uuid references public.perfis (id) on delete set null
);

-- o combinado novo: quando o aviso saiu e a partir de quando vale para quem já estava no Publike e não escolheu
-- (null: só para quem liberar)
create table if not exists privado.contato_no_convite_regra (
  id boolean primary key default true check (id),
  aviso_em timestamptz not null default now(),
  vale_em timestamptz
);
insert into privado.contato_no_convite_regra (vale_em) values ('2026-11-23 00:00:00-03') on conflict (id) do nothing;

alter table privado.contato_no_convite_escolha enable row level security;
alter table privado.contato_no_convite_contas enable row level security;
alter table privado.contato_no_convite_regra enable row level security;
revoke all on privado.contato_no_convite_escolha, privado.contato_no_convite_contas, privado.contato_no_convite_regra
  from public, anon, authenticated;

-- 2. Quem pode ----------------------------------------------------------------------------------------------------------

-- um plano que libera tudo valendo (assinatura ou 30 dias pagos) ou a cortesia do Plano Agência
create or replace function privado.contato_no_convite_com_plano(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.assinaturas a
                  where a.conta_id = p_conta and a.situacao = 'ativa' and privado.libera_tudo(a.recurso))
      or exists (select 1 from privado.cobrancas c
                  where c.conta_id = p_conta and c.situacao = 'paga' and privado.libera_tudo(c.recurso)
                    and c.periodo_ate + case when c.compra_id is null then interval '3 days' else interval '0' end > now())
      or exists (select 1 from privado.plano_agencia_cortesia x
                  where x.conta_id = p_conta and (x.ate is null or x.ate > now()))
$$;

-- o plano, os 15 dias grátis ou a liberação do Admin
create or replace function privado.contato_no_convite_liberado(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.contato_no_convite_com_plano(p_conta)
      or exists (select 1 from privado.contato_no_convite_contas x
                  where x.conta_id = p_conta and (x.ate is null or x.ate > now()))
$$;

-- quantos contatos a cada 24 horas: 30 no plano (e na liberação do Admin), 5 nos 15 dias grátis
create or replace function privado.contato_no_convite_limite(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when privado.contato_no_convite_com_plano(p_conta)
                or exists (select 1 from privado.contato_no_convite_contas x where x.conta_id = p_conta and x.ate is null)
              then 30 else 5 end
$$;

-- os contatos que a conta viu no convite nas últimas 24 horas
create or replace function privado.contato_no_convite_hoje(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.conexoes c
   where c.empresa_id = p_conta and c.pedida_por = p_conta and c.contato_liberado_em > now() - interval '24 hours'
$$;

-- O talento mostra o contato no convite? 'sim' (liberou, chegou depois do aviso ou passou o prazo); 'desligado'
-- (prefere só depois de aceitar); 'aviso' (já estava no Publike e não escolheu: vale a partir de 23/11); 'fora' (não
-- é pessoa ou não deixou as empresas encontrarem o currículo).
create or replace function privado.contato_no_convite_do_talento(p_talento uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when v.perfil_id is null then 'fora'
    when e.mostrar is false then 'desligado'
    when e.mostrar is true then 'sim'
    when r.aviso_em is null or v.desde >= r.aviso_em then 'sim'
    when r.vale_em is not null and now() >= r.vale_em then 'sim'
    else 'aviso'
  end
    from (select 1) um
    left join public.perfis p on p.id = p_talento and p.tipo = 'pessoa'
    left join public.curriculo_visivel v on v.perfil_id = p.id
    left join privado.contato_no_convite_escolha e on e.perfil_id = p.id
    left join privado.contato_no_convite_regra r on true
$$;

-- Libera o contato num pedido pendente que a empresa (p_conta) fez a um talento. Devolve null (liberou agora), 'ja'
-- (já estava liberado) ou o motivo de não liberar: 'sem_plano', 'limite', 'desligado', 'aviso' ou 'fora'.
create or replace function privado.liberar_contato_no_convite(p_conexao uuid, p_conta uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.conexoes;
  v_talento text;
begin
  select * into v from public.conexoes c where c.id = p_conexao for update;
  if not found or v.status <> 'pendente' or v.pedida_por <> p_conta or v.empresa_id <> p_conta then
    return 'fora';
  end if;
  if v.contato_liberado_em is not null then
    return 'ja';
  end if;
  if not exists (select 1 from public.perfis p where p.id = p_conta and p.tipo in ('comercio', 'empresa', 'agencia')) then
    return 'fora';
  end if;
  if not privado.contato_no_convite_liberado(p_conta) then
    return 'sem_plano';
  end if;
  v_talento := privado.contato_no_convite_do_talento(v.talento_id);
  if v_talento <> 'sim' then
    return v_talento;
  end if;
  perform pg_advisory_xact_lock(hashtext('publike:contato_no_convite:' || p_conta::text));
  if privado.contato_no_convite_hoje(p_conta) >= privado.contato_no_convite_limite(p_conta) then
    return 'limite';
  end if;
  update public.conexoes c set contato_liberado_em = now() where c.id = v.id;
  return null;
end
$$;

revoke execute on function privado.contato_no_convite_com_plano(uuid), privado.contato_no_convite_liberado(uuid),
  privado.contato_no_convite_limite(uuid), privado.contato_no_convite_hoje(uuid),
  privado.contato_no_convite_do_talento(uuid), privado.liberar_contato_no_convite(uuid, uuid)
  from public, anon, authenticated;

-- 3. A conversa abre no convite liberado -------------------------------------------------------------------------------

create or replace function privado.dupla_ligada(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_a <> p_b, false)
     and not privado.ha_bloqueio(p_a, p_b)
     and (exists (select 1 from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
                   where c.perfil_id = p_b and a.autor_id = p_a and c.status = 'match')
          or exists (select 1 from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
                      where c.perfil_id = p_a and a.autor_id = p_b and c.status = 'match')
          or exists (select 1 from public.conexoes x
                      where (x.status = 'aceita' or (x.status = 'pendente' and x.contato_liberado_em is not null))
                        and ((x.talento_id = p_a and x.empresa_id = p_b)
                             or (x.talento_id = p_b and x.empresa_id = p_a))))
$$;

-- a lista de Conversas: o convite liberado entra como ligação ("convite"), sem contar como conectados
create or replace function public.conversas_por_pessoa(p_outro uuid default null)
returns table (
  outro_id uuid,
  outro_nome text,
  outro_foto text,
  outro_tipo text,
  outro_na_vitrine boolean,
  conversa_id uuid,
  conectados boolean,
  vagas jsonb,
  desde timestamptz,
  ultima_texto text,
  ultima_em timestamptz,
  ultima_minha boolean,
  nao_lidas integer,
  marcada_nao_lida boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select public.conta_atual() as id),
  ligacoes as (
    -- anúncio meu, curtido pela outra pessoa
    select c.perfil_id as outro, a.id as anuncio_id, c.perfil_id, a.titulo, a.tipo, 'publiquei'::text as papel,
           coalesce(e.etapa, 'novo') as etapa, coalesce(c.respondida_em, c.criado_em) as desde
      from eu
      join public.anuncios a on a.autor_id = eu.id
      join public.curtidas c on c.anuncio_id = a.id and c.status = 'match'
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where p_outro is null or c.perfil_id = p_outro
    union all
    -- anúncio da outra pessoa, curtido por mim
    select a.autor_id, a.id, c.perfil_id, a.titulo, a.tipo, 'curti', coalesce(e.etapa, 'novo'),
           coalesce(c.respondida_em, c.criado_em)
      from eu
      join public.curtidas c on c.perfil_id = eu.id and c.status = 'match'
      join public.anuncios a on a.id = c.anuncio_id
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where p_outro is null or a.autor_id = p_outro
    union all
    -- conexão aceita, ou o convite com o contato liberado (a conversa já abriu)
    select case when x.talento_id = eu.id then x.empresa_id else x.talento_id end, null, null, null, null,
           case when x.status = 'aceita' then 'conexao' else 'convite' end, null,
           coalesce(x.respondida_em, x.contato_liberado_em, x.criado_em)
      from eu
      join public.conexoes x on eu.id in (x.talento_id, x.empresa_id)
       and (x.status = 'aceita' or (x.status = 'pendente' and x.contato_liberado_em is not null))
     where p_outro is null or p_outro in (x.talento_id, x.empresa_id)
  ),
  pessoas as (
    select l.outro,
           max(l.desde) as desde,
           bool_or(l.papel = 'conexao') as conectados,
           coalesce(jsonb_agg(jsonb_build_object(
                      'anuncio_id', l.anuncio_id, 'perfil_id', l.perfil_id, 'titulo', l.titulo, 'tipo', l.tipo,
                      'papel', l.papel, 'etapa', l.etapa, 'desde', l.desde) order by l.desde desc)
                      filter (where l.anuncio_id is not null),
                    '[]'::jsonb) as vagas
      from ligacoes l
     group by l.outro
  )
  select p.outro, privado.nome_nas_conversas(o.id, o.nome, o.tipo), o.foto, o.tipo,
         exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = o.id),
         d.id, p.conectados, p.vagas, p.desde,
         u.texto, u.criado_em, u.autor_id = eu.id,
         -- a conversa marcada como não lida conta como uma, até ser aberta
         greatest(coalesce((select count(*)::integer from public.mensagens m
                             where m.conversa_id = d.id and m.autor_id <> eu.id
                               and not exists (select 1 from privado.mensagens_lidas l
                                                where l.mensagem_id = m.id)), 0),
                  case when x.conta_id is null then 0 else 1 end),
         x.conta_id is not null
    from eu
    cross join pessoas p
    join public.perfis o on o.id = p.outro
    left join public.conversas d on d.conta_a = least(eu.id, p.outro) and d.conta_b = greatest(eu.id, p.outro)
    left join privado.conversas_nao_lidas x on x.conversa_id = d.id and x.conta_id = eu.id
    left join lateral (
      select m.texto, m.criado_em, m.autor_id
        from public.mensagens m
       where m.conversa_id = d.id
       order by m.criado_em desc, m.id desc
       limit 1
    ) u on true
   where p.outro <> eu.id
     and (o.suspenso_ate is null or o.suspenso_ate <= now())
     and not privado.ha_bloqueio(eu.id, p.outro)
   order by coalesce(u.criado_em, p.desde) desc
   limit 500
$$;
grant execute on function public.conversas_por_pessoa(uuid) to authenticated;

-- 4. As conexões: no convite liberado, o nome inteiro, a foto, os contatos e a conversa -------------------------------

drop function if exists public.minhas_conexoes(uuid);
create function public.minhas_conexoes(p_outro uuid default null)
returns table (
  id uuid,
  status text,
  pedi boolean,
  outro_id uuid,
  outro_nome text,
  outro_foto text,
  outro_tipo text,
  outro_cidade text,
  outro_bairro text,
  outro_na_vitrine boolean,
  mensagem text,
  criado_em timestamptz,
  respondida_em timestamptz,
  whatsapp text,
  email text,
  ultima_texto text,
  ultima_em timestamptz,
  ultima_minha boolean,
  nao_lidas integer,
  contato_liberado boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select public.conta_atual() as id)
  select c.id, c.status, c.pedida_por = eu.id,
         o.id,
         case when o.tipo = 'pessoa' and not l.aberta then privado.nome_curto(o.nome)
              else privado.nome_nas_conversas(o.id, o.nome, o.tipo) end,
         case when o.tipo = 'pessoa' and not l.aberta then null else o.foto end,
         o.tipo, o.cidade, o.bairro,
         exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = o.id),
         c.mensagem, c.criado_em, c.respondida_em,
         case when l.aberta then ct.whatsapp end,
         case when l.aberta then ct.email end,
         u.texto, u.criado_em, u.autor_id = eu.id,
         coalesce((select count(*)::integer from public.mensagens m
                    where m.conversa_id = d.id and m.autor_id <> eu.id
                      and not exists (select 1 from privado.mensagens_lidas lm where lm.mensagem_id = m.id)), 0),
         c.status = 'pendente' and c.contato_liberado_em is not null
    from eu
    join public.conexoes c on eu.id in (c.talento_id, c.empresa_id)
    cross join lateral (
      select c.status = 'aceita' or (c.status = 'pendente' and c.contato_liberado_em is not null) as aberta
    ) l
    join public.perfis o on o.id = case when c.talento_id = eu.id then c.empresa_id else c.talento_id end
    left join public.contatos ct on ct.perfil_id = o.id
    left join public.conversas d
      on l.aberta
     and d.conta_a = least(c.talento_id, c.empresa_id) and d.conta_b = greatest(c.talento_id, c.empresa_id)
    left join lateral (
      select m.texto, m.criado_em, m.autor_id
        from public.mensagens m
       where m.conversa_id = d.id
       order by m.criado_em desc, m.id desc
       limit 1
    ) u on true
   where (p_outro is null or o.id = p_outro)
     and not (c.status = 'recusada' and c.pedida_por <> eu.id)
     and (o.suspenso_ate is null or o.suspenso_ate <= now())
     and not privado.ha_bloqueio(eu.id, o.id)
   order by coalesce(u.criado_em, c.respondida_em, c.criado_em) desc
   limit 500
$$;
revoke execute on function public.minhas_conexoes(uuid) from public, anon;
grant execute on function public.minhas_conexoes(uuid) to authenticated;

drop function if exists public.estado_conexoes(uuid[]);
create function public.estado_conexoes(p_outros uuid[])
returns table (outro_id uuid, conexao_id uuid, status text, pedi boolean, contato_liberado boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select public.conta_atual() as id)
  select case when c.talento_id = eu.id then c.empresa_id else c.talento_id end, c.id, c.status,
         c.pedida_por = eu.id, c.status = 'pendente' and c.contato_liberado_em is not null
    from eu
    join public.conexoes c on eu.id in (c.talento_id, c.empresa_id)
   where (case when c.talento_id = eu.id then c.empresa_id else c.talento_id end)
         = any ((coalesce(p_outros, '{}'::uuid[]))[1:60])
     and not (c.status = 'recusada' and c.pedida_por <> eu.id)
$$;
revoke execute on function public.estado_conexoes(uuid[]) from public, anon;
grant execute on function public.estado_conexoes(uuid[]) to authenticated;

-- 5. Pedir conexão: com o plano, o contato do talento já vem no pedido -------------------------------------------------

drop function if exists public.pedir_conexao(uuid, text);
create function public.pedir_conexao(p_com uuid, p_mensagem text default null)
returns table (id uuid, status text, contato_liberado boolean, motivo text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  eu uuid := public.conta_atual();
  v_meu_tipo text;
  v_tipo text;
  v_suspenso timestamptz;
  v_talento uuid;
  v_empresa uuid;
  v_recado text := nullif(btrim(regexp_replace(coalesce(p_mensagem, ''), '[ \t]+', ' ', 'g')), '');
  v_atual public.conexoes;
  v_existe boolean;
  v_id uuid;
  v_motivo text := 'fora';
  v_liberado boolean;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if p_com is null or p_com = eu then
    raise exception 'Escolha com quem se conectar.' using errcode = '22023';
  end if;
  select p.tipo into v_meu_tipo from public.perfis p where p.id = eu;
  select p.tipo, p.suspenso_ate into v_tipo, v_suspenso from public.perfis p where p.id = p_com;
  if v_tipo is null or (v_suspenso is not null and v_suspenso > now()) or privado.ha_bloqueio(eu, p_com) then
    raise exception 'Não dá para se conectar com esta conta.' using errcode = 'P0001';
  end if;
  -- quem é quem no par: pessoa com empresa, a pessoa é o talento; entre iguais, pela ordem dos ids
  if v_meu_tipo = 'pessoa' and v_tipo <> 'pessoa' then
    v_talento := eu; v_empresa := p_com;
  elsif v_meu_tipo <> 'pessoa' and v_tipo = 'pessoa' then
    v_talento := p_com; v_empresa := eu;
  else
    v_talento := least(eu, p_com); v_empresa := greatest(eu, p_com);
  end if;
  if char_length(coalesce(v_recado, '')) > 300 then
    raise exception 'O recado passa de 300 letras.' using errcode = '22023';
  end if;
  if public.tem_contato(v_recado, true) then
    raise exception 'Tire o telefone, e-mail ou link do recado. O contato aparece quando a conexão for aceita.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;

  -- a dupla, em qualquer ordem (as linhas antigas de pessoa com empresa já estão na ordem certa)
  select * into v_atual from public.conexoes c
   where least(c.talento_id, c.empresa_id) = least(eu, p_com)
     and greatest(c.talento_id, c.empresa_id) = greatest(eu, p_com)
   for update;
  v_existe := found;

  if v_existe then
    if v_atual.status = 'aceita' then
      raise exception 'Vocês já estão conectados.' using errcode = 'P0001', hint = 'ja_conectados';
    end if;
    if v_atual.status = 'pendente' and v_atual.pedida_por = eu then
      raise exception 'Você já pediu. Agora é com o outro lado.' using errcode = 'P0001', hint = 'ja_pedi';
    end if;
    if v_atual.status = 'pendente' then
      -- o outro lado já tinha pedido: os dois querem, a conexão sai aceita
      update public.conexoes c set status = 'aceita', respondida_em = now() where c.id = v_atual.id;
      insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
      values (v_atual.pedida_por, 'conexao', eu,
              left(coalesce(privado.nome_na_conexao(eu, true), 'Alguém')
                   || ' aceitou a conexão. Os contatos e a conversa já estão liberados no Publike.', 300));
      update public.notificacoes n set lida = true
       where n.destinatario_id = eu and n.tipo = 'conexao' and n.ator_id = v_atual.pedida_por and not n.lida;
      if v_atual.empresa_id = eu and privado.conexao_de_talento(v_atual.talento_id, v_atual.empresa_id) then
        perform privado.anotar_atividade(eu, 'aceitou a conexão com {candidato}', null, v_atual.talento_id);
      end if;
      return query select v_atual.id, 'aceita'::text, false, null::text;
      return;
    end if;
    -- recusada: quem pediu espera 30 dias para pedir de novo (o outro lado pode pedir quando quiser)
    if v_atual.pedida_por = eu and v_atual.respondida_em > now() - interval '30 days' then
      raise exception 'O pedido anterior não foi aceito. Dá para pedir de novo a partir de %.',
        to_char((v_atual.respondida_em + interval '30 days') at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
        using errcode = 'P0001', hint = 'recusada';
    end if;
  end if;

  perform privado.conferir_limite('conexao', 30, 'Você já pediu 30 conexões hoje. Tente de novo amanhã.');
  if v_existe then
    update public.conexoes c
       set status = 'pendente', pedida_por = eu, mensagem = v_recado, criado_em = now(), respondida_em = null,
           contato_liberado_em = null
     where c.id = v_atual.id
     returning c.id into v_id;
  else
    insert into public.conexoes (talento_id, empresa_id, pedida_por, mensagem)
    values (v_talento, v_empresa, eu, v_recado)
    returning conexoes.id into v_id;
  end if;

  -- empresa, comércio ou agência com plano pedindo a um talento: o contato já vem no pedido
  if v_empresa = eu and v_meu_tipo <> 'pessoa' and v_tipo = 'pessoa' then
    v_motivo := privado.liberar_contato_no_convite(v_id, eu);
  end if;
  v_liberado := v_motivo is null;

  insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
  values (p_com, 'conexao', eu,
          left(coalesce(privado.nome_na_conexao(eu, false), 'Alguém')
               || case when v_liberado
                         then ' quer se conectar com você e, pelo plano do Publike, já vê o seu WhatsApp e e-mail.'
                              || ' Pode te chamar por lá ou pela conversa; responda o pedido quando quiser.'
                       when v_tipo = 'pessoa' then ' quer se conectar com você. Veja o pedido e responda.'
                       else ' quer se conectar com vocês. Veja o pedido e responda.' end, 300));
  if v_empresa = eu and privado.conexao_de_talento(v_talento, v_empresa) then
    perform privado.anotar_atividade(eu, 'pediu conexão com {candidato}', null, v_talento);
    if v_liberado then
      perform privado.anotar_atividade(eu, 'viu o contato de {candidato} no convite', null, v_talento);
    end if;
  end if;
  return query select v_id, 'pendente'::text, v_liberado, case when v_liberado then null else v_motivo end;
end
$$;
revoke execute on function public.pedir_conexao(uuid, text) from public, anon;
grant execute on function public.pedir_conexao(uuid, text) to authenticated;

-- Ver o contato num pedido que já estava esperando (feito antes do plano ou dos 15 dias grátis)
create or replace function public.liberar_contato_da_conexao(p_conexao uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v public.conexoes;
  v_motivo text;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select * into v from public.conexoes c where c.id = p_conexao and c.pedida_por = eu;
  if not found or v.status <> 'pendente' then
    raise exception 'Este pedido não está mais esperando resposta.' using errcode = 'P0001';
  end if;
  if privado.ha_bloqueio(eu, v.talento_id) then
    raise exception 'Não dá para ver o contato desta pessoa.' using errcode = 'P0001';
  end if;
  v_motivo := privado.liberar_contato_no_convite(p_conexao, eu);
  if v_motivo = 'ja' then
    return;
  end if;
  if v_motivo is null then
    insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
    values (v.talento_id, 'conexao', eu,
            left(coalesce(privado.nome_na_conexao(eu, false), 'Uma empresa')
                 || ' pediu conexão com você e, pelo plano do Publike, agora vê o seu WhatsApp e e-mail.'
                 || ' Pode te chamar por lá ou pela conversa; responda o pedido quando quiser.', 300));
    if privado.conexao_de_talento(v.talento_id, eu) then
      perform privado.anotar_atividade(eu, 'viu o contato de {candidato} no convite', null, v.talento_id);
    end if;
    return;
  end if;
  raise exception '%', case v_motivo
      when 'sem_plano' then 'Ver o contato no convite vem nos planos do Publike.'
      when 'limite' then 'Você chegou ao limite de ' || privado.contato_no_convite_limite(eu)
                         || ' contatos em 24 horas. Logo libera mais.'
      when 'desligado' then 'Esta pessoa prefere mostrar o contato só depois de aceitar a conexão.'
      when 'aviso' then 'O contato desta pessoa aparece no convite a partir de '
                        || to_char((select r.vale_em from privado.contato_no_convite_regra r) at time zone 'America/Sao_Paulo', 'DD/MM')
                        || '. Até lá, quando ela aceitar.'
      else 'Não dá para ver o contato desta pessoa no convite.' end
    using errcode = 'P0001', hint = 'contato_' || v_motivo;
end
$$;
revoke execute on function public.liberar_contato_da_conexao(uuid) from public, anon;
grant execute on function public.liberar_contato_da_conexao(uuid) to authenticated;

-- 6. Para as telas ----------------------------------------------------------------------------------------------------

-- quem contrata: o plano, os 15 dias grátis, o limite e quantos já viu nas últimas 24 horas
create or replace function public.meu_contato_no_convite()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then null else (
    select jsonb_build_object(
      'plano', privado.contato_no_convite_com_plano(public.conta_atual()),
      'testou', x.conta_id is not null,
      'sem_prazo', x.conta_id is not null and x.ate is null,
      'ate', case when x.ate > now() then x.ate end,
      'limite', privado.contato_no_convite_limite(public.conta_atual()),
      'hoje', privado.contato_no_convite_hoje(public.conta_atual()),
      'vale_em', (select r.vale_em from privado.contato_no_convite_regra r))
      from (select 1) um
      left join privado.contato_no_convite_contas x on x.conta_id = public.conta_atual())
  end
$$;
revoke execute on function public.meu_contato_no_convite() from public, anon;
grant execute on function public.meu_contato_no_convite() to authenticated;

-- "Testar 15 dias grátis": uma vez por conta, só para quem contrata
create or replace function public.testar_contato_no_convite()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  v_fim timestamptz := now() + interval '15 days';
begin
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from public.perfis p where p.id = conta and p.tipo in ('comercio', 'empresa', 'agencia')) then
    raise exception 'Os 15 dias grátis são para contas de comércio, empresa ou agência.' using errcode = 'P0001';
  end if;
  if privado.contato_no_convite_com_plano(conta) then
    raise exception 'O contato no convite já vem no seu plano.' using errcode = 'P0001';
  end if;
  if exists (select 1 from privado.contato_no_convite_contas x where x.conta_id = conta) then
    raise exception 'Sua conta já usou os 15 dias grátis do contato no convite. Ele continua nos planos.'
      using errcode = 'P0001', hint = 'ja_testou';
  end if;
  insert into privado.contato_no_convite_contas (conta_id, ate, pessoa_id) values (conta, v_fim, (select auth.uid()));
  return v_fim;
end
$$;
revoke execute on function public.testar_contato_no_convite() from public, anon;
grant execute on function public.testar_contato_no_convite() to authenticated;

-- quem contrata, na página do talento: o contato dele vem no convite? ('sim', 'desligado', 'aviso' ou 'fora')
create or replace function public.contato_no_convite_de(p_talento uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.perfis p
                      where p.id = public.conta_atual() and p.tipo in ('comercio', 'empresa', 'agencia')) then null
    when privado.ha_bloqueio(public.conta_atual(), p_talento) then 'fora'
    else privado.contato_no_convite_do_talento(p_talento)
  end
$$;
revoke execute on function public.contato_no_convite_de(uuid) from public, anon;
grant execute on function public.contato_no_convite_de(uuid) to authenticated;

-- quem procura: a escolha (true, false ou null, ainda não escolheu), a situação de hoje ('sim', 'desligado', 'aviso'
-- ou 'fora') e a data em que vale para quem não escolheu
create or replace function public.meu_contato_no_convite_talento()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then null else (
    select jsonb_build_object(
      'escolha', e.mostrar,
      'situacao', privado.contato_no_convite_do_talento((select auth.uid())),
      'vale_em', r.vale_em)
      from (select 1) um
      left join privado.contato_no_convite_escolha e on e.perfil_id = (select auth.uid())
      left join privado.contato_no_convite_regra r on true)
  end
$$;
revoke execute on function public.meu_contato_no_convite_talento() from public, anon;
grant execute on function public.meu_contato_no_convite_talento() to authenticated;

-- "Liberar agora" e "Não liberar" (no aviso do sino e em "Quem vê seu currículo")
create or replace function public.mostrar_contato_no_convite(p_sim boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_sim is null then
    raise exception 'Escolha liberar ou não.' using errcode = '22023';
  end if;
  insert into privado.contato_no_convite_escolha (perfil_id, mostrar) values ((select auth.uid()), p_sim)
  on conflict (perfil_id) do update set mostrar = excluded.mostrar, em = now();
end
$$;
revoke execute on function public.mostrar_contato_no_convite(boolean) from public, anon;
grant execute on function public.mostrar_contato_no_convite(boolean) to authenticated;

-- 7. O aviso no sino para quem já deixou as empresas encontrarem o currículo (uma vez), com "Liberar agora" e "Não
-- liberar" embaixo (o sino reconhece pelo link) ------------------------------------------------------------------------

insert into public.notificacoes (destinatario_id, tipo, texto, link)
select v.perfil_id, 'comunicado',
       'Novidade: as empresas com plano do Publike podem ver o seu WhatsApp e e-mail quando pedem conexão com você, '
       || 'para te chamar mais rápido. Quer liberar já? Sem resposta, passa a valer em 23/11, e você muda quando '
       || 'quiser em “Quem vê seu currículo”.',
       '/perfil/curriculo#contato-no-convite'
  from public.curriculo_visivel v
  join public.perfis p on p.id = v.perfil_id and p.tipo = 'pessoa'
  cross join privado.contato_no_convite_regra r
 where v.desde < r.aviso_em
   and not exists (select 1 from public.notificacoes n
                    where n.destinatario_id = v.perfil_id and n.tipo = 'comunicado'
                      and n.link = '/perfil/curriculo#contato-no-convite');

notify pgrst, 'reload schema';
