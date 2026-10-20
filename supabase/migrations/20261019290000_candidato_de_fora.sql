-- Candidato de fora (19/10/2026). Pode rodar de novo sem problema.
--
-- Quem publicou uma vaga recebe um currículo por fora (WhatsApp, e-mail, em mãos) e chama a
-- pessoa pelo Publike. O site lê o currículo (PDF ou foto) e guarda só os campos do formulário,
-- sem telefone nem e-mail, no convite; o arquivo não fica guardado. A agência manda o link.
--
-- A pessoa abre o link, entra com o celular e aceita (respondendo às perguntas da vaga). Quem já
-- tem currículo dá match na hora; quem não tem confere o currículo que veio pronto e, ao salvar,
-- dá match (o mesmo caminho do "aceite que espera o currículo"). Só entra no quadro quem aceitar.
--
-- O convite vale 14 dias. O currículo lido sai do convite quando dá match, quando a pessoa diz
-- que não quer, quando quem convidou cancela ou quando o convite vence (limpeza diária).

-- 1. Os convites -------------------------------------------------------------------------

create table if not exists public.convites_candidato (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  autor_id uuid not null references public.perfis (id) on delete cascade,
  -- o nome que a agência escreveu (a pessoa ainda não tem conta)
  nome text not null check (char_length(nome) between 2 and 80),
  -- os campos que a leitura achou no currículo (sem contato); some quando não serve mais
  curriculo jsonb check (curriculo is null or (jsonb_typeof(curriculo) = 'object' and octet_length(curriculo::text) <= 20000)),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '14 days',
  cancelado_em timestamptz,
  recusado_em timestamptz,
  -- a conta de quem aceitou
  perfil_id uuid references public.perfis (id) on delete set null,
  aceito_em timestamptz
);
create index if not exists convites_candidato_anuncio on public.convites_candidato (anuncio_id, criado_em desc);
create index if not exists convites_candidato_pessoa on public.convites_candidato (anuncio_id, perfil_id)
  where perfil_id is not null;

alter table public.convites_candidato enable row level security;
revoke all on public.convites_candidato from anon, authenticated;
grant select on public.convites_candidato to authenticated;
grant select, insert, update, delete on public.convites_candidato to service_role;

drop policy if exists "quem convidou vê os convites" on public.convites_candidato;
create policy "quem convidou vê os convites" on public.convites_candidato
  for select to authenticated
  using (autor_id = (select auth.uid()));

-- A situação do convite: valido, aceito, recusado, cancelado, vencido ou fora_do_ar (a vaga saiu do ar).
create or replace function privado.situacao_convite_candidato(k public.convites_candidato)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when k.aceito_em is not null then 'aceito'
           when k.recusado_em is not null then 'recusado'
           when k.cancelado_em is not null then 'cancelado'
           when k.expira_em <= now() then 'vencido'
           when not exists (
             select 1 from public.anuncios a
              where a.id = k.anuncio_id and a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null
           ) then 'fora_do_ar'
           else 'valido'
         end
$$;
revoke execute on function privado.situacao_convite_candidato(public.convites_candidato) from public;


-- 2. Quem publicou: criar e cancelar -----------------------------------------------------

-- até 60 convites por dia
alter table privado.limites_uso drop constraint if exists limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check check (acao = any (array[
  'anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao',
  'mensagem', 'seguir', 'recomendacao', 'etapa', 'contratacao', 'ia_resumo', 'convite', 'talento',
  'convite_candidato']));

create or replace function public.criar_convite_candidato(p_anuncio uuid, p_nome text, p_curriculo jsonb default null)
returns table (id uuid, token text, expira_em timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  v_status text;
  v_expira timestamptz;
  v_preenchida timestamptz;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select a.status, a.expira_em, a.preenchida_em into v_status, v_expira, v_preenchida
    from public.anuncios a
   where a.id = p_anuncio and a.autor_id = eu and a.tipo = 'vaga';
  if not found then
    raise exception 'Esta vaga não é sua.' using errcode = '42501';
  end if;
  if v_status <> 'ativo' or v_expira <= now() or v_preenchida is not null then
    raise exception 'Ponha a vaga no ar para chamar candidatos.' using errcode = 'P0001', hint = 'vaga';
  end if;
  if char_length(v_nome) < 2 then
    raise exception 'Escreva o nome da pessoa.' using errcode = '22023', hint = 'nome';
  end if;
  if char_length(v_nome) > 80 then
    raise exception 'Use no máximo 80 letras no nome.' using errcode = '22023', hint = 'nome';
  end if;
  if public.tem_contato(v_nome) then
    raise exception 'Só o nome: o telefone a pessoa põe quando entrar.' using errcode = '22023', hint = 'nome';
  end if;
  if p_curriculo is not null and (jsonb_typeof(p_curriculo) <> 'object' or octet_length(p_curriculo::text) > 20000) then
    raise exception 'Leia o currículo de novo.' using errcode = '22023', hint = 'curriculo';
  end if;
  if (select count(*) from public.convites_candidato k
       where k.anuncio_id = p_anuncio and k.aceito_em is null and k.recusado_em is null
         and k.cancelado_em is null and k.expira_em > now()) >= 50 then
    raise exception 'Esta vaga já tem 50 convites esperando resposta. Cancele os que não vão mais.'
      using errcode = 'P0001', hint = 'limite_convites';
  end if;
  perform privado.conferir_limite('convite_candidato', 60, 'Você chamou muita gente hoje. Tente de novo amanhã.');
  return query
    insert into public.convites_candidato as k (token, anuncio_id, autor_id, nome, curriculo)
    values (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
            p_anuncio, eu, v_nome, p_curriculo)
    returning k.id, k.token, k.expira_em;
end
$$;

-- Quem convidou desiste: o link para de valer e o currículo lido sai do convite.
create or replace function public.cancelar_convite_candidato(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  update public.convites_candidato k
     set cancelado_em = coalesce(k.cancelado_em, now()), curriculo = null
   where k.id = p_id and k.autor_id = (select auth.uid()) and k.aceito_em is null;
end
$$;


-- 3. Quem foi chamado: ver, aceitar ou dizer que não quer --------------------------------

-- O que a página do link mostra (sem conta também). Do currículo, só se existe.
create or replace function public.convite_candidato_do_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k public.convites_candidato;
  eu uuid := (select auth.uid());
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into k from public.convites_candidato x where x.token = p_token;
  if not found then
    return null;
  end if;
  return (
    select jsonb_build_object(
             'situacao', privado.situacao_convite_candidato(k),
             'anuncio_id', k.anuncio_id,
             'nome', split_part(k.nome, ' ', 1),
             'expira_em', k.expira_em,
             'tem_curriculo', k.curriculo is not null,
             -- quem abriu: quem convidou (prévia), quem aceitou, ou outra pessoa
             'previa', eu is not null and eu = k.autor_id,
             'meu', eu is not null and eu = k.perfil_id,
             'quem', jsonb_build_object('nome', p.nome, 'foto', p.foto, 'verificado', p.verificado, 'tipo', p.tipo),
             'vaga', jsonb_build_object(
               'titulo', a.titulo,
               'cidade', a.cidade,
               'bairro', a.bairro,
               'contratante', case when a.contratante_confidencial then null else nullif(btrim(a.contratante), '') end,
               'confidencial', coalesce(a.contratante_confidencial, false)
             ))
      from public.anuncios a
      join public.perfis p on p.id = k.autor_id
     where a.id = k.anuncio_id
  );
end
$$;

-- Aceitar: a candidatura entra aceita. Com currículo, dá match na hora ('match'); sem, a pessoa
-- confere o que veio pronto e salva ('curriculo'): o gatilho do currículo dá o match.
create or replace function public.aceitar_convite_candidato(p_token text, p_respostas jsonb default '{}')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  k public.convites_candidato;
  v_autor uuid;
  v_status text;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Este convite não existe. Confira o link.' using errcode = 'P0001', hint = 'convite';
  end if;
  select * into k from public.convites_candidato x where x.token = p_token for update;
  if not found then
    raise exception 'Este convite não existe. Confira o link.' using errcode = 'P0001', hint = 'convite';
  end if;
  select a.autor_id into v_autor from public.anuncios a where a.id = k.anuncio_id;
  if v_autor = eu then
    raise exception 'Este convite é para o candidato: mande o link para ele.' using errcode = 'P0001', hint = 'convite';
  end if;
  if k.aceito_em is not null then
    if k.perfil_id = eu then
      return coalesce((select case when c.status = 'match' then 'match' else 'curriculo' end
                         from public.curtidas c where c.anuncio_id = k.anuncio_id and c.perfil_id = eu), 'match');
    end if;
    raise exception 'Este convite já foi aceito por outra conta.' using errcode = 'P0001', hint = 'convite';
  end if;
  if privado.situacao_convite_candidato(k) <> 'valido' then
    raise exception 'Este convite não vale mais. Fale com quem chamou você.' using errcode = 'P0001', hint = 'convite';
  end if;
  if privado.bloqueado_com(v_autor) then
    raise exception 'Não dá para aceitar: vocês desfizeram um match antes.' using errcode = 'P0001', hint = 'bloqueado';
  end if;

  -- o convite fica com a conta antes da candidatura (o aviso para quem convidou usa isso)
  update public.convites_candidato x set perfil_id = eu, aceito_em = now() where x.id = k.id;

  select c.status into v_status from public.curtidas c where c.anuncio_id = k.anuncio_id and c.perfil_id = eu;
  if v_status = 'desfeito' then
    raise exception 'Vocês já desfizeram um match nesta vaga. Fale com quem chamou você.'
      using errcode = 'P0001', hint = 'bloqueado';
  end if;
  if v_status is null then
    -- os gatilhos de sempre: perfil com WhatsApp, perguntas obrigatórias, limite do dia
    insert into public.curtidas (anuncio_id, perfil_id, respostas)
    values (k.anuncio_id, eu, coalesce(p_respostas, '{}'::jsonb));
  end if;

  if exists (select 1 from public.curriculos cv where cv.perfil_id = eu) then
    update public.curtidas c
       set status = 'match', respondida_em = now(), aceita_em = null
     where c.anuncio_id = k.anuncio_id and c.perfil_id = eu and c.status <> 'match';
    update public.convites_candidato x set curriculo = null where x.id = k.id;
    return 'match';
  end if;
  update public.curtidas c
     set status = 'pendente', aceita_em = coalesce(c.aceita_em, now())
   where c.anuncio_id = k.anuncio_id and c.perfil_id = eu and c.status <> 'match';
  return case when exists (select 1 from public.curtidas c
                            where c.anuncio_id = k.anuncio_id and c.perfil_id = eu and c.status = 'match')
              then 'match' else 'curriculo' end;
end
$$;

-- "Não quero": vale sem conta (o link chegou para a pessoa). O currículo lido sai na hora.
create or replace function public.recusar_convite_candidato(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.convites_candidato;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return 'invalido';
  end if;
  select * into k from public.convites_candidato x where x.token = p_token for update;
  if not found or k.aceito_em is not null then
    return 'invalido';
  end if;
  if exists (select 1 from public.anuncios a where a.id = k.anuncio_id and a.autor_id = (select auth.uid())) then
    return 'invalido';
  end if;
  update public.convites_candidato x
     set recusado_em = coalesce(x.recusado_em, now()), curriculo = null
   where x.id = k.id;
  if k.recusado_em is null and k.cancelado_em is null then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
    select k.autor_id, 'convite_candidato', k.anuncio_id,
           left(split_part(k.nome, ' ', 1) || ' disse que não tem interesse na vaga “' || a.titulo || '”.', 300)
      from public.anuncios a where a.id = k.anuncio_id;
  end if;
  return 'ok';
end
$$;

-- O currículo que veio pronto, para a pessoa conferir (só quem aceitou o convite).
create or replace function public.curriculo_do_convite(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select k.curriculo
    from public.convites_candidato k
   where k.token = p_token
     and k.perfil_id = (select auth.uid())
     and k.aceito_em is not null
$$;

revoke execute on function public.criar_convite_candidato(uuid, text, jsonb),
                          public.cancelar_convite_candidato(uuid),
                          public.aceitar_convite_candidato(text, jsonb),
                          public.curriculo_do_convite(text) from public, anon;
grant execute on function public.criar_convite_candidato(uuid, text, jsonb),
                          public.cancelar_convite_candidato(uuid),
                          public.aceitar_convite_candidato(text, jsonb),
                          public.curriculo_do_convite(text) to authenticated;
revoke execute on function public.convite_candidato_do_token(text),
                          public.recusar_convite_candidato(text) from public;
grant execute on function public.convite_candidato_do_token(text),
                          public.recusar_convite_candidato(text) to anon, authenticated;


-- 4. Avisos ------------------------------------------------------------------------------

-- "Não tenho interesse" vira um aviso (e um e-mail) para quem convidou, que leva aos convites da vaga.
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato'));

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
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato') then
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
    ('convite_candidato', 'usuarios', 25, 'Candidato de fora não quis o convite',
     'Quando a pessoa chamada pelo link (candidato de fora) diz que não tem interesse na vaga.',
     array['nome', 'titulo', 'motivo', 'link'],
     'Resposta ao convite para “{{titulo}}”',
     'Oi, {{nome}}.

{{motivo}}

Veja os convites da vaga e chame outra pessoa, se quiser.',
     'Ver os convites')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- O aviso de curtida diz quando a pessoa veio pelo convite (o resto é como antes).
create or replace function public.notificar_curtida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dono uuid;
  v_titulo text;
  v_tipo text;
  v_direto boolean;
  quem text;
  v_convite boolean;
begin
  select a.autor_id, a.titulo, a.tipo, a.contato_direto and a.status = 'ativo'
    into dono, v_titulo, v_tipo, v_direto
    from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into quem from public.perfis p where p.id = new.perfil_id;
  v_convite := exists (
    select 1 from public.convites_candidato k
     where k.anuncio_id = new.anuncio_id and k.perfil_id = new.perfil_id and k.aceito_em is not null);
  -- curtir, descurtir e curtir de novo não enche o sino de avisos
  if not exists (
    select 1 from public.notificacoes n
     where n.destinatario_id = dono and n.anuncio_id = new.anuncio_id and n.ator_id = new.perfil_id
       and n.tipo = 'curtida' and n.criado_em > now() - interval '24 hours'
  ) then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (dono, 'curtida', new.anuncio_id, new.perfil_id,
            left(case when v_convite
                      then coalesce(quem, 'Alguém') || ' aceitou seu convite para “' || v_titulo || '”.'
                           || case when exists (select 1 from public.curriculos cv where cv.perfil_id = new.perfil_id)
                                   then ' Deu match: o contato de vocês está liberado.'
                                   else ' Falta conferir o currículo: avisamos quando chegar.' end
                      when v_tipo = 'servico'
                      then coalesce(quem, 'Alguém') || ' quer contratar você: “' || v_titulo || '”.'
                      else coalesce(quem, 'Alguém') || ' curtiu “' || v_titulo || '”.'
                 end
                 || case when v_direto and not v_convite
                         then ' O contato de vocês já está liberado (contato direto).' else '' end, 300));
  end if;
  return null;
end
$$;

-- Deu match com quem veio pelo convite: o currículo lido não serve mais.
create or replace function privado.convite_cumprido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'match' and old.status is distinct from 'match' then
    update public.convites_candidato k
       set curriculo = null
     where k.anuncio_id = new.anuncio_id and k.perfil_id = new.perfil_id and k.curriculo is not null;
  end if;
  return null;
end
$$;
drop trigger if exists curtidas_convite_cumprido on public.curtidas;
create trigger curtidas_convite_cumprido
  after update of status on public.curtidas
  for each row execute function privado.convite_cumprido();


-- 5. Limpeza diária ----------------------------------------------------------------------

create or replace function privado.limpar_convites_candidato()
returns void
language sql
security definer
set search_path = ''
as $$
  -- o currículo lido sai do convite vencido, cancelado, recusado ou aceito há mais de 14 dias
  update public.convites_candidato k
     set curriculo = null
   where k.curriculo is not null
     and (k.expira_em <= now() or k.cancelado_em is not null or k.recusado_em is not null
          or k.aceito_em < now() - interval '14 days');
  -- e o convite que ninguém aceitou some 90 dias depois de vencer
  delete from public.convites_candidato k
   where k.aceito_em is null and k.expira_em < now() - interval '90 days';
$$;
revoke execute on function privado.limpar_convites_candidato() from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('publike-limpar-convites-candidato', '35 6 * * *',
                          'select privado.limpar_convites_candidato()');
  end if;
exception
  when others then
    raise notice 'pg_cron indisponível (%). A limpeza dos convites fica para quando ativar.', sqlerrm;
end
$$;

notify pgrst, 'reload schema';
