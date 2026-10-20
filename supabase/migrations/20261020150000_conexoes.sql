-- Conexões entre talentos e empresas (20/10/2026). Pode rodar de novo sem problema.
--
-- Sem precisar de vaga: a empresa (comércio, empresa ou agência) pede conexão com quem está na
-- aba Talentos, ou quem está na aba pede conexão com a empresa (na página dela). O outro lado
-- aceita ou recusa. Aceitou: os contatos (WhatsApp e e-mail) dos dois aparecem e abre uma
-- conversa dentro do Publike. Qualquer um desfaz quando quiser (a conversa some junto).
--   * Uma linha por par (talento, empresa). Os dois pediram: a conexão já sai aceita.
--   * Antes do sim, a empresa vê o nome encurtado (Maria S.) e sem foto, como na aba Talentos.
--   * Recusou: quem pediu vê "não aceitou" e só pede de novo depois de 30 dias.
--   * Recado do pedido sem telefone, e-mail ou link; até 30 pedidos por dia; bloqueio e conta
--     suspensa barram. Quem é da equipe de uma agência age pela agência (conta_atual()).
--
-- Rode depois de 20261020120000_equipe_agencia.sql. Rodou de novo uma migração mais antiga (que
-- recria o aviso por e-mail ou a lista de tipos de aviso)? Rode esta de novo depois.

-- 1. As conexões ---------------------------------------------------------------------------------

create table if not exists public.conexoes (
  id uuid primary key default gen_random_uuid(),
  talento_id uuid not null references public.perfis (id) on delete cascade,
  empresa_id uuid not null references public.perfis (id) on delete cascade,
  pedida_por uuid not null references public.perfis (id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'aceita', 'recusada')),
  mensagem text check (char_length(mensagem) <= 300),
  criado_em timestamptz not null default now(),
  respondida_em timestamptz,
  unique (talento_id, empresa_id),
  check (talento_id <> empresa_id),
  check (pedida_por in (talento_id, empresa_id))
);
create index if not exists conexoes_empresa_idx on public.conexoes (empresa_id, status);
create index if not exists conexoes_talento_idx on public.conexoes (talento_id, status);
comment on table public.conexoes is
  'Conexão entre quem está na aba Talentos e uma empresa, comércio ou agência, sem vaga. Aceita: contatos e conversa.';

alter table public.conexoes enable row level security;
revoke all on public.conexoes from anon, authenticated;
grant select on public.conexoes to authenticated;
drop policy if exists "os dois da conexão veem" on public.conexoes;
create policy "os dois da conexão veem" on public.conexoes
  for select to authenticated
  using ((select public.conta_atual()) in (talento_id, empresa_id));


-- 2. A conversa da conexão -----------------------------------------------------------------------

create table if not exists public.mensagens_conexao (
  id bigint generated always as identity primary key,
  conexao_id uuid not null references public.conexoes (id) on delete cascade,
  autor_id uuid not null references public.perfis (id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 2000),
  criado_em timestamptz not null default now(),
  lida_em timestamptz
);
create index if not exists mensagens_conexao_idx on public.mensagens_conexao (conexao_id, id);

-- Sou um dos dois de uma conexão aceita?
create or replace function privado.na_conexao(p_conexao uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conexoes c
     where c.id = p_conexao and c.status = 'aceita'
       and public.conta_atual() in (c.talento_id, c.empresa_id)
  )
$$;
revoke execute on function privado.na_conexao(uuid) from public;
grant execute on function privado.na_conexao(uuid) to authenticated;

-- Ler: só os dois da conexão aceita (também pelo Realtime). Escrever: só pelas funções.
alter table public.mensagens_conexao enable row level security;
revoke all on public.mensagens_conexao from anon, authenticated;
grant select on public.mensagens_conexao to authenticated;
drop policy if exists "os dois da conexão leem a conversa" on public.mensagens_conexao;
create policy "os dois da conexão leem a conversa" on public.mensagens_conexao
  for select to authenticated
  using ((select privado.na_conexao(conexao_id)));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensagens_conexao'
     ) then
    alter publication supabase_realtime add table public.mensagens_conexao;
  end if;
end
$$;


-- 3. Avisos, e-mail e limites -------------------------------------------------------------------

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao'));

alter table privado.limites_uso drop constraint if exists limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check check (acao = any (array[
  'anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao',
  'mensagem', 'seguir', 'recomendacao', 'etapa', 'contratacao', 'ia_resumo', 'convite', 'talento',
  'convite_candidato', 'convite_equipe', 'conexao']));

-- O aviso de conexão também vai por e-mail (pedido, aceite e mensagem nova), e leva para a conexão.
create or replace function privado.notificacao_por_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_nota text;
  v_quem text;
  v_autor uuid;
  v_motivo text;
  v_futuro boolean;
  v_depois text;
  v_entrevista jsonb;
begin
  select a.titulo, a.nota_moderacao, a.autor_id into v_titulo, v_nota, v_autor
    from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into v_quem from public.perfis p where p.id = new.ator_id;
  if new.tipo = 'match_desfeito' then
    select public.rotulo_motivo_desfeito(d.motivo), d.futuro into v_motivo, v_futuro
      from public.matches_desfeitos d
     where d.anuncio_id = new.anuncio_id and d.desfeito_por = new.ator_id
     order by d.id desc limit 1;
    if v_futuro then
      v_depois := coalesce(v_quem, 'A outra pessoa') || ' disse que topa negociar com você em outro momento. '
                  || case when new.destinatario_id = v_autor
                          then 'Se quiser, dá para dar match de novo na lista de interessados.'
                          else 'Se ainda tiver interesse, dá para curtir o anúncio de novo.' end;
    end if;
  end if;
  if new.tipo in ('etapa', 'seguindo', 'recomendacao', 'contratacao', 'entrevista', 'entrevista_resposta', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao') then
    v_motivo := new.texto;
  end if;
  -- entrevista: os dados para o convite de agenda (.ics) que vai anexo no e-mail
  if new.tipo in ('entrevista', 'entrevista_resposta') then
    select jsonb_build_object(
             'id', e.id,
             'quando', e.quando,
             'duracao_min', e.duracao_min,
             'formato', e.formato,
             'local', e.local,
             'obs', e.obs,
             'situacao', e.situacao,
             'atualizado_em', e.atualizado_em,
             'anuncio_id', e.anuncio_id,
             'perfil_id', e.perfil_id,
             'vaga', a.titulo,
             'empresa', pa.nome,
             'candidato', pc.nome,
             'para', case when new.destinatario_id = a.autor_id then 'empresa' else 'candidato' end)
      into v_entrevista
      from public.entrevistas e
      join public.anuncios a on a.id = e.anuncio_id
      join public.perfis pa on pa.id = a.autor_id
      join public.perfis pc on pc.id = e.perfil_id
     where e.anuncio_id = new.anuncio_id
       and e.perfil_id = case when new.destinatario_id = a.autor_id then new.ator_id else new.destinatario_id end
     order by e.atualizado_em desc
     limit 1;
  end if;
  perform privado.enfileirar_email(new.destinatario_id, new.tipo, jsonb_build_object(
    'quem', coalesce(v_quem, 'Alguém'),
    'titulo', coalesce(v_titulo, ''),
    'motivo', coalesce(v_motivo, v_nota, ''),
    'depois', coalesce(v_depois, ''),
    'caminho', case new.tipo
                 when 'curtida' then '/painel/anuncio/' || new.anuncio_id
                 when 'match' then '/painel/matches'
                 when 'liberado' then '/anuncio/' || new.anuncio_id
                 when 'removido' then '/privacidade#regras'
                 when 'avaliacao' then '/painel/avaliacoes'
                 when 'avaliacao_retida' then '/privacidade#regras'
                 when 'match_desfeito' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/anuncio/' || new.anuncio_id end
                 when 'etapa' then '/painel/curtidas'
                 when 'mensagem' then '/painel/conversas/' || new.anuncio_id || '/' || new.ator_id
                 when 'seguindo' then '/anuncio/' || new.anuncio_id
                 when 'busca' then '/anuncio/' || new.anuncio_id
                 when 'convite' then '/anuncio/' || new.anuncio_id
                 when 'vaga_preenchida' then '/?tipo=vaga'
                 when 'recomendacao' then '/perfil/' || new.destinatario_id || '#recomendacoes'
                 when 'contratacao' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/painel/curtidas' end
                 when 'entrevista' then '/anuncio/' || new.anuncio_id
                 when 'entrevista_resposta' then '/painel/anuncio/' || new.anuncio_id || '/quadro'
                 when 'aceite_curriculo' then '/perfil/curriculo?next=%2Fanuncio%2F' || new.anuncio_id
                 when 'curriculo_recebido' then '/painel/anuncio/' || new.anuncio_id || '#candidato-' || new.ator_id
                 when 'finalistas' then '/painel/anuncio/' || new.anuncio_id || '/finalistas'
                 when 'convite_candidato' then '/painel/anuncio/' || new.anuncio_id || '/convidar'
                 when 'equipe' then '/painel/equipe'
                 when 'conexao' then '/painel/conexoes/' || new.ator_id
                 else '/painel'
               end)
    || case when v_entrevista is null then '{}'::jsonb else jsonb_build_object('entrevista', v_entrevista) end);
  return null;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('conexao', 'usuarios', 27, 'Conexão (talento e empresa)',
     'Quando uma empresa ou um talento pede conexão, quando o pedido é aceito e quando chega mensagem nova na conversa da conexão.',
     array['nome', 'motivo', 'link'],
     'Novidade na sua conexão',
     'Oi, {{nome}}.

{{motivo}}

Abra no Publike para ver e responder.',
     'Abrir no Publike')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;


-- 4. Pedir, responder, desfazer ------------------------------------------------------------------

-- Quem é quem no par: o talento é a pessoa (na aba Talentos); a empresa, comércio, empresa ou agência.
-- Devolve o nome que a outra ponta vê: pessoa, encurtada até a conexão ser aceita.
create or replace function privado.nome_na_conexao(p_perfil uuid, p_aceita boolean)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.tipo = 'pessoa' and not p_aceita then privado.nome_curto(p.nome) else p.nome end
    from public.perfis p where p.id = p_perfil
$$;
revoke execute on function privado.nome_na_conexao(uuid, boolean) from public;

-- Pede conexão (empresa com talento ou talento com empresa). Se o outro lado já tinha pedido,
-- a conexão sai aceita na hora.
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
  if (v_meu_tipo = 'pessoa') = (v_tipo = 'pessoa') then
    raise exception 'A conexão é entre quem procura trabalho e empresas, comércios e agências.'
      using errcode = 'P0001', hint = 'mesmo_lado';
  end if;
  if v_meu_tipo = 'pessoa' then
    v_talento := eu; v_empresa := p_com;
  else
    v_talento := p_com; v_empresa := eu;
  end if;
  -- o talento está (ou esteve, para quem já é conexão) na aba Talentos
  if not exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = v_talento) then
    if v_talento = eu then
      raise exception 'Para pedir conexão, apareça na aba Talentos: ligue a opção no seu currículo.'
        using errcode = 'P0001', hint = 'sem_vitrine';
    end if;
    raise exception 'Essa pessoa não está mais na aba Talentos.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_recado, '')) > 300 then
    raise exception 'O recado passa de 300 letras.' using errcode = '22023';
  end if;
  if public.tem_contato(v_recado, true) then
    raise exception 'Tire o telefone, e-mail ou link do recado. O contato aparece quando a conexão for aceita.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;

  select * into v_atual from public.conexoes c
   where c.talento_id = v_talento and c.empresa_id = v_empresa
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
      if v_empresa = eu then
        perform privado.anotar_atividade(eu, 'aceitou a conexão com {candidato}', null, v_talento);
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
               || case when v_talento = eu then ' quer se conectar com vocês. Veja o currículo e responda.'
                       else ' quer se conectar com você. Veja o pedido e responda.' end, 300));
  if v_empresa = eu then
    perform privado.anotar_atividade(eu, 'pediu conexão com {candidato}', null, v_talento);
  end if;
  return query select v_id, 'pendente'::text;
end
$$;
revoke execute on function public.pedir_conexao(uuid, text) from public, anon;
grant execute on function public.pedir_conexao(uuid, text) to authenticated;

-- Aceita ou recusa um pedido que recebi.
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
    if v.empresa_id = eu then
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

-- Desfaz: cancela o pedido que fiz, tira da lista o que não foi aceito ou desfaz a conexão (a
-- conversa some junto). Qualquer um dos dois pede de novo depois.
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
  if v.status = 'aceita' and v.empresa_id = eu then
    perform privado.anotar_atividade(eu, 'desfez a conexão com {candidato}', null, v.talento_id);
  end if;
end
$$;
revoke execute on function public.desfazer_conexao(uuid) from public, anon;
grant execute on function public.desfazer_conexao(uuid) to authenticated;


-- 5. A conversa ---------------------------------------------------------------------------------

create or replace function public.enviar_mensagem_conexao(p_conexao uuid, p_texto text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v_texto text := btrim(coalesce(p_texto, ''));
  v public.conexoes;
  v_outro uuid;
  v_suspenso timestamptz;
  v_id bigint;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if v_texto = '' then
    raise exception 'Escreva a mensagem.' using errcode = '22023';
  end if;
  if char_length(v_texto) > 2000 then
    raise exception 'A mensagem passa de 2000 letras.' using errcode = '22023';
  end if;
  select * into v from public.conexoes c
   where c.id = p_conexao and c.status = 'aceita' and eu in (c.talento_id, c.empresa_id);
  if not found then
    raise exception 'A conversa abre quando a conexão é aceita.' using errcode = '42501';
  end if;
  v_outro := case when eu = v.talento_id then v.empresa_id else v.talento_id end;
  select p.suspenso_ate into v_suspenso from public.perfis p where p.id = v_outro;
  if (v_suspenso is not null and v_suspenso > now()) or privado.ha_bloqueio(eu, v_outro) then
    raise exception 'Não dá para mandar mensagem para esta conta.' using errcode = 'P0001';
  end if;
  perform privado.conferir_limite('mensagem', 300, 'Você mandou muitas mensagens hoje. Tente de novo amanhã.');

  insert into public.mensagens_conexao (conexao_id, autor_id, texto)
  values (v.id, eu, v_texto)
  returning id into v_id;

  -- aviso para o outro lado: um só, até ele abrir a conexão
  if not exists (
    select 1 from public.notificacoes n
     where n.destinatario_id = v_outro and n.tipo = 'conexao' and n.ator_id = eu and not n.lida
  ) then
    insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
    values (v_outro, 'conexao', eu,
            left(coalesce(privado.nome_na_conexao(eu, true), 'Alguém') || ' mandou uma mensagem na conexão.', 300));
  end if;
  return v_id;
end
$$;
revoke execute on function public.enviar_mensagem_conexao(uuid, text) from public, anon;
grant execute on function public.enviar_mensagem_conexao(uuid, text) to authenticated;

-- Abri a conexão: as mensagens do outro lado e os avisos dele ficam lidos.
create or replace function public.marcar_conexao_lida(p_conexao uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v public.conexoes;
begin
  select * into v from public.conexoes c where c.id = p_conexao and eu in (c.talento_id, c.empresa_id);
  if eu is null or not found then
    return;
  end if;
  update public.mensagens_conexao m
     set lida_em = now()
   where m.conexao_id = v.id and m.autor_id <> eu and m.lida_em is null;
  update public.notificacoes n
     set lida = true
   where n.destinatario_id = eu and n.tipo = 'conexao' and not n.lida
     and n.ator_id = case when eu = v.talento_id then v.empresa_id else v.talento_id end;
end
$$;
revoke execute on function public.marcar_conexao_lida(uuid) from public, anon;
grant execute on function public.marcar_conexao_lida(uuid) to authenticated;


-- 6. As listas -----------------------------------------------------------------------------------

-- As minhas conexões e pedidos (ou só a com uma conta), do mais recente para o mais antigo. O
-- contato só vem na conexão aceita; quem recusou um pedido não o vê mais.
create or replace function public.minhas_conexoes(p_outro uuid default null)
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
  nao_lidas integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select public.conta_atual() as id)
  select c.id, c.status, c.pedida_por = eu.id,
         o.id,
         case when o.tipo = 'pessoa' and c.status <> 'aceita' then privado.nome_curto(o.nome) else o.nome end,
         case when o.tipo = 'pessoa' and c.status <> 'aceita' then null else o.foto end,
         o.tipo, o.cidade, o.bairro,
         exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = o.id),
         c.mensagem, c.criado_em, c.respondida_em,
         case when c.status = 'aceita' then ct.whatsapp end,
         case when c.status = 'aceita' then ct.email end,
         u.texto, u.criado_em, u.autor_id = eu.id,
         (select count(*)::integer from public.mensagens_conexao m
           where m.conexao_id = c.id and m.autor_id <> eu.id and m.lida_em is null)
    from eu
    join public.conexoes c on eu.id in (c.talento_id, c.empresa_id)
    join public.perfis o on o.id = case when c.talento_id = eu.id then c.empresa_id else c.talento_id end
    left join public.contatos ct on ct.perfil_id = o.id
    left join lateral (
      select m.texto, m.criado_em, m.autor_id
        from public.mensagens_conexao m
       where m.conexao_id = c.id and c.status = 'aceita'
       order by m.id desc
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

-- Como está a conexão com cada conta da lista (para o botão Conectar dos cartões).
create or replace function public.estado_conexoes(p_outros uuid[])
returns table (outro_id uuid, conexao_id uuid, status text, pedi boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select public.conta_atual() as id)
  select case when c.talento_id = eu.id then c.empresa_id else c.talento_id end, c.id, c.status,
         c.pedida_por = eu.id
    from eu
    join public.conexoes c on eu.id in (c.talento_id, c.empresa_id)
   where (case when c.talento_id = eu.id then c.empresa_id else c.talento_id end)
         = any ((coalesce(p_outros, '{}'::uuid[]))[1:60])
     and not (c.status = 'recusada' and c.pedida_por <> eu.id)
$$;
revoke execute on function public.estado_conexoes(uuid[]) from public, anon;
grant execute on function public.estado_conexoes(uuid[]) to authenticated;

notify pgrst, 'reload schema';
