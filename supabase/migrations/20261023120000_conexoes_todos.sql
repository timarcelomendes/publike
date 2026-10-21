-- Conexão entre quaisquer contas (21/10/2026). Pode rodar de novo sem problema.
--
-- Antes, a conexão era só entre quem está na aba Talentos e uma empresa, comércio ou agência.
-- Agora qualquer conta pede conexão com qualquer outra: pessoa com pessoa, empresa com empresa,
-- pessoa com empresa (sem precisar estar na aba Talentos). Aceitou: igual a antes, os contatos
-- (WhatsApp e e-mail) dos dois aparecem e abre a conversa no Publike.
--   * A tabela continua com talento_id e empresa_id. Entre pessoa e empresa, talento é a pessoa
--     (como antes). Entre iguais, talento_id é o menor id e empresa_id o maior; um índice único
--     pelo par (menor, maior) garante uma linha só por dupla, em qualquer ordem.
--   * Antes do sim, quem é pessoa continua com o nome encurtado (Maria S.) e sem foto.
--   * Continuam: recusou, quem pediu espera 30 dias; até 30 pedidos por dia; recado sem contato;
--     bloqueio e conta suspensa barram.
--
-- Rode depois de 20261022120000_recados.sql.

comment on table public.conexoes is
  'Conexão entre duas contas quaisquer, sem vaga. Entre pessoa e empresa, talento_id é a pessoa; '
  'entre iguais, talento_id é o menor id. Aceita: contatos e conversa.';

create unique index if not exists conexoes_dupla_idx
  on public.conexoes (least(talento_id, empresa_id), greatest(talento_id, empresa_id));

-- A conexão é de uma pessoa com uma empresa (comércio, empresa ou agência)? Só nesse caso a
-- empresa anota na atividade da equipe ("pediu conexão com {candidato}").
create or replace function privado.conexao_de_talento(p_talento uuid, p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfis p where p.id = p_talento and p.tipo = 'pessoa')
     and exists (select 1 from public.perfis p where p.id = p_empresa and p.tipo <> 'pessoa')
$$;
revoke execute on function privado.conexao_de_talento(uuid, uuid) from public;

-- Pede conexão com qualquer conta. Se o outro lado já tinha pedido, a conexão sai aceita na hora.
create or replace function public.pedir_conexao(p_com uuid, p_mensagem text default null)
returns table (id uuid, status text)
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
      return query select v_atual.id, 'aceita'::text;
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
       set status = 'pendente', pedida_por = eu, mensagem = v_recado, criado_em = now(), respondida_em = null
     where c.id = v_atual.id
     returning c.id into v_id;
  else
    insert into public.conexoes (talento_id, empresa_id, pedida_por, mensagem)
    values (v_talento, v_empresa, eu, v_recado)
    returning conexoes.id into v_id;
  end if;

  insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
  values (p_com, 'conexao', eu,
          left(coalesce(privado.nome_na_conexao(eu, false), 'Alguém')
               || case when v_tipo = 'pessoa' then ' quer se conectar com você. Veja o pedido e responda.'
                       else ' quer se conectar com vocês. Veja o pedido e responda.' end, 300));
  if v_empresa = eu and privado.conexao_de_talento(v_talento, v_empresa) then
    perform privado.anotar_atividade(eu, 'pediu conexão com {candidato}', null, v_talento);
  end if;
  return query select v_id, 'pendente'::text;
end
$$;
revoke execute on function public.pedir_conexao(uuid, text) from public, anon;
grant execute on function public.pedir_conexao(uuid, text) to authenticated;

-- Aceita ou recusa um pedido que recebi (a atividade da equipe só entre empresa e pessoa).
create or replace function public.responder_conexao(p_conexao uuid, p_aceitar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v public.conexoes;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select * into v from public.conexoes c
   where c.id = p_conexao and eu in (c.talento_id, c.empresa_id)
   for update;
  if not found or v.status <> 'pendente' then
    raise exception 'Este pedido não está mais esperando resposta.' using errcode = 'P0001';
  end if;
  if v.pedida_por = eu then
    raise exception 'Quem responde é o outro lado. Você pode cancelar o pedido.' using errcode = 'P0001';
  end if;
  if p_aceitar then
    if privado.ha_bloqueio(eu, v.pedida_por) then
      raise exception 'Não dá para se conectar com esta conta.' using errcode = 'P0001';
    end if;
    update public.conexoes c set status = 'aceita', respondida_em = now() where c.id = v.id;
    insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
    values (v.pedida_por, 'conexao', eu,
            left(coalesce(privado.nome_na_conexao(eu, true), 'Alguém')
                 || ' aceitou a conexão. Os contatos e a conversa já estão liberados no Publike.', 300));
    if v.empresa_id = eu and privado.conexao_de_talento(v.talento_id, v.empresa_id) then
      perform privado.anotar_atividade(eu, 'aceitou a conexão com {candidato}', null, v.talento_id);
    end if;
  else
    -- sem aviso para quem pediu: ele vê "não aceitou" na lista
    update public.conexoes c set status = 'recusada', respondida_em = now() where c.id = v.id;
  end if;
  -- o aviso do pedido fica lido
  update public.notificacoes n set lida = true
   where n.destinatario_id = eu and n.tipo = 'conexao' and n.ator_id = v.pedida_por and not n.lida;
end
$$;
revoke execute on function public.responder_conexao(uuid, boolean) from public, anon;
grant execute on function public.responder_conexao(uuid, boolean) to authenticated;

-- Desfaz (a atividade da equipe só entre empresa e pessoa).
create or replace function public.desfazer_conexao(p_conexao uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v public.conexoes;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  select * into v from public.conexoes c
   where c.id = p_conexao and eu in (c.talento_id, c.empresa_id)
   for update;
  if not found then
    raise exception 'Conexão não encontrada.' using errcode = 'P0002';
  end if;
  if v.status = 'pendente' and v.pedida_por <> eu then
    raise exception 'Para não aceitar o pedido, use Recusar.' using errcode = 'P0001';
  end if;
  if v.status = 'recusada' and v.pedida_por <> eu then
    raise exception 'Você já recusou este pedido.' using errcode = 'P0001';
  end if;
  if v.status = 'recusada' and v.respondida_em > now() - interval '30 days' then
    -- some da lista de quem pediu, mas a espera de 30 dias continua valendo
    raise exception 'Este pedido some da lista sozinho em 30 dias.' using errcode = 'P0001';
  end if;
  delete from public.conexoes c where c.id = v.id;
  -- os avisos que levavam para ela
  update public.notificacoes n set lida = true
   where n.tipo = 'conexao' and not n.lida
     and ((n.destinatario_id = v.talento_id and n.ator_id = v.empresa_id)
          or (n.destinatario_id = v.empresa_id and n.ator_id = v.talento_id));
  if v.status = 'aceita' and v.empresa_id = eu and privado.conexao_de_talento(v.talento_id, v.empresa_id) then
    perform privado.anotar_atividade(eu, 'desfez a conexão com {candidato}', null, v.talento_id);
  end if;
end
$$;
revoke execute on function public.desfazer_conexao(uuid) from public, anon;
grant execute on function public.desfazer_conexao(uuid) to authenticated;

update public.modelos_email
   set nome = 'Conexão',
       descricao = 'Quando alguém pede conexão, quando o pedido é aceito e quando chega mensagem nova na conversa da conexão.'
 where chave = 'conexao' and nome = 'Conexão (talento e empresa)';

notify pgrst, 'reload schema';
