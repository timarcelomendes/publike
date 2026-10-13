-- Segurança e LGPD (13/10/2026). Pode rodar de novo sem problema.
--   1. Aceite das regras e da política de privacidade: guardado com a versão e a data.
--   2. Contra e-mails e avisos em massa: limites na mudança de etapa, na contratação pública,
--      na troca de CNPJ de agência e na edição de avaliação; e-mail repetido para a mesma pessoa espera.
--   3. Etapas de Entrevista e Contratado (e as de serviço) só depois do match, também no banco.
--   4. Denúncias: só tiram o anúncio do ar as de contas com pelo menos 3 dias.
--   5. Recomendação: sem telefone, e-mail ou link, e só aparece no perfil depois que a pessoa aprova.
--   6. Selo de verificado sai quando muda o nome, o tipo da conta ou o CNPJ.
--   7. Moderação: ninguém modera avaliação própria; duas listas voltam a ser só do admin.
--   8. Mudar a empresa contratante manda o anúncio de novo para a IA.
--   9. Sugestões: página com barra invertida ou caractere de controle não vira link.
--  10. Assistente: teto geral por hora, além do limite de cada pessoa.

alter table privado.limites_uso drop constraint if exists limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check
  check (acao in ('anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao',
                  'mensagem', 'seguir', 'recomendacao', 'etapa', 'contratacao'));

-- 1. Aceite das regras e da política de privacidade ---------------------------

create table if not exists privado.aceites (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  versao text not null check (versao ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  aceito_em timestamptz not null default now(),
  primary key (usuario_id, versao)
);
alter table privado.aceites enable row level security;
revoke all on table privado.aceites from public, anon, authenticated;

-- Quem cria a conta marca "Li e aceito"; guardamos qual versão e quando.
create or replace function public.registrar_aceite(p_versao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_versao is null or p_versao !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Versão inválida.' using errcode = '22023';
  end if;
  insert into privado.aceites (usuario_id, versao) values (usuario, p_versao)
  on conflict do nothing;
end
$$;
revoke execute on function public.registrar_aceite(text) from public, anon;
grant execute on function public.registrar_aceite(text) to authenticated;

-- 2. Contra e-mails e avisos em massa --------------------------------------------

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
begin
  select * into cfg from public.config_site limit 1;
  if not found or not cfg.emails_ativos then
    return;
  end if;
  if (p_modelo = 'curtida' and not cfg.email_curtida)
     or (p_modelo = 'match' and not cfg.email_match)
     or (p_modelo in ('em_analise', 'removido', 'liberado') and not cfg.email_moderacao)
     or (de_conta and not cfg.email_conta) then
    return;
  end if;
  -- avisos de conta vão mesmo para quem desligou os avisos
  if not de_conta then
    select c.receber_emails into quer from public.contatos c where c.perfil_id = p_usuario;
    if quer is false then
      return;
    end if;
  end if;
  -- avisos que podem se repetir: no máximo um do mesmo tipo a cada 30 minutos para a mesma pessoa
  if p_modelo in ('curtida', 'etapa', 'contratacao', 'recomendacao', 'seguindo', 'mensagem') and exists (
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
  insert into privado.fila_emails (modelo, para, usuario_id, dados)
  values (p_modelo, lower(destino), p_usuario,
          jsonb_build_object('nome', coalesce(privado.nome_para_email(p_usuario), ''))
          || coalesce(p_dados, '{}'::jsonb));
exception
  when others then
    raise warning 'Publike: e-mail % não entrou na fila (%).', p_modelo, sqlerrm;
end
$function$;

CREATE OR REPLACE FUNCTION public.salvar_etapa_candidato(p_anuncio uuid, p_perfil uuid, p_etapa text, p_nota text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_tipo text;
  v_titulo text;
  v_antes text;
  v_status text;
  v_permitidas text[];
  v_aviso text;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if public.minha_conta_suspensa() then
    raise exception 'Sua conta está suspensa. Se achar que é um engano, fale com a gente.'
      using errcode = 'P0001', hint = 'conta_suspensa';
  end if;
  select a.tipo, a.titulo, c.status into v_tipo, v_titulo, v_status
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio
     and c.perfil_id = p_perfil
     and a.autor_id = (select auth.uid());
  if v_tipo is null then
    raise exception 'Essa pessoa não curtiu um anúncio seu.' using errcode = '42501';
  end if;
  if p_etapa is null
     or (v_tipo = 'vaga' and p_etapa not in ('novo', 'analise', 'entrevista', 'contratado', 'nao_seguiu'))
     or (v_tipo = 'servico' and p_etapa not in ('novo', 'orcamento', 'agendado', 'concluido', 'nao_seguiu')) then
    raise exception 'Escolha uma etapa da lista.' using errcode = '22023';
  end if;
  if char_length(v_nota) > 1000 then
    raise exception 'A anotação passa de 1000 letras.' using errcode = '22023';
  end if;

  select e.etapa into v_antes
    from public.etapas_candidatos e
   where e.anuncio_id = p_anuncio and e.perfil_id = p_perfil;

  -- Entrevista e Contratado (no serviço, Orçamento, Agendado e Concluído) só depois do match;
  -- dispensado ou match desfeito não muda de etapa. A anotação continua livre.
  v_permitidas := case
    when v_status = 'match' then
      case when v_tipo = 'vaga' then array['novo', 'analise', 'entrevista', 'contratado', 'nao_seguiu']
           else array['novo', 'orcamento', 'agendado', 'concluido', 'nao_seguiu'] end
    when v_status = 'pendente' then
      case when v_tipo = 'vaga' then array['novo', 'analise'] else array['novo'] end
    else array[]::text[]
  end;
  if p_etapa is distinct from coalesce(v_antes, 'novo') then
    if not (p_etapa = any (v_permitidas)) then
      raise exception 'Essa etapa só pode ser marcada depois do match.' using errcode = 'P0001', hint = 'etapa_sem_match';
    end if;
    perform privado.conferir_limite('etapa', 300, 'Você mudou muitas etapas hoje. Tente de novo amanhã.');
  end if;

  insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa, nota)
  values (p_anuncio, p_perfil, p_etapa, v_nota)
  on conflict (anuncio_id, perfil_id) do update
    set etapa = excluded.etapa,
        nota = excluded.nota,
        atualizado_em = case when public.etapas_candidatos.etapa is distinct from excluded.etapa
                             then now() else public.etapas_candidatos.atualizado_em end;

  if coalesce(v_antes, 'novo') <> p_etapa and p_etapa <> 'novo' then
    v_aviso := case when p_etapa = 'nao_seguiu'
                    then case when v_tipo = 'vaga' then 'O processo de “' else 'O pedido “' end
                         || v_titulo || '” foi encerrado. Obrigado pelo interesse!'
                    else '“' || v_titulo || '” agora está em: ' || public.rotulo_etapa_para_quem_curtiu(p_etapa) || '.'
               end;
    -- mudou de novo em menos de uma hora e a pessoa ainda não viu: troca o aviso, sem outro e-mail
    update public.notificacoes n
       set texto = v_aviso, criado_em = now()
     where n.destinatario_id = p_perfil and n.tipo = 'etapa' and n.anuncio_id = p_anuncio
       and not n.lida and n.criado_em > now() - interval '1 hour';
    if not found then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
      values (p_perfil, 'etapa', p_anuncio, (select auth.uid()), v_aviso);
    end if;
  end if;
end
$function$;

CREATE OR REPLACE FUNCTION public.autorizar_contratacao_publica(p_anuncio uuid, p_perfil uuid, p_sim boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  usuario uuid := (select auth.uid());
  v_autor uuid;
  v_titulo text;
  v_nome_autor text;
  v_nome_pessoa text;
  v_empresa boolean;
  v_antes_empresa boolean;
  v_antes_pessoa boolean;
  v_ok_empresa boolean;
  v_ok_pessoa boolean;
begin
  if usuario is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  select a.autor_id, a.titulo into v_autor, v_titulo
    from public.anuncios a
    join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = p_perfil and c.status = 'match'
    join public.etapas_candidatos e on e.anuncio_id = a.id and e.perfil_id = p_perfil and e.etapa = 'contratado'
   where a.id = p_anuncio and a.tipo = 'vaga';
  if v_autor is null then
    raise exception 'Só dá para mostrar contratações marcadas como Contratado.' using errcode = '22023';
  end if;
  perform privado.conferir_limite('contratacao', 30, 'Você mudou isso muitas vezes hoje. Tente de novo amanhã.');
  if usuario = v_autor then
    v_empresa := true;
  elsif usuario = p_perfil then
    v_empresa := false;
  else
    raise exception 'Essa contratação não é sua.' using errcode = '42501';
  end if;

  select c.ok_empresa, c.ok_pessoa into v_antes_empresa, v_antes_pessoa
    from public.contratacoes_publicas c where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil;

  insert into public.contratacoes_publicas (anuncio_id, perfil_id, ok_empresa, ok_pessoa)
  values (p_anuncio, p_perfil, v_empresa and p_sim, (not v_empresa) and p_sim)
  on conflict (anuncio_id, perfil_id) do update
    set ok_empresa = case when v_empresa then p_sim else public.contratacoes_publicas.ok_empresa end,
        ok_pessoa = case when v_empresa then public.contratacoes_publicas.ok_pessoa else p_sim end;

  update public.contratacoes_publicas c
     set publicado_em = case when c.ok_empresa and c.ok_pessoa then coalesce(c.publicado_em, now()) else null end
   where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil
  returning c.ok_empresa, c.ok_pessoa into v_ok_empresa, v_ok_pessoa;

  -- o primeiro sim pede o sim do outro lado (um aviso só: tirar e pôr de novo não avisa outra vez)
  if p_sim and not (v_ok_empresa and v_ok_pessoa)
     and coalesce(case when v_empresa then v_antes_empresa else v_antes_pessoa end, false) = false
     and not exists (select 1 from public.notificacoes n
                      where n.tipo = 'contratacao' and n.anuncio_id = p_anuncio
                        and n.destinatario_id = case when v_empresa then p_perfil else v_autor end) then
    select p.nome into v_nome_autor from public.perfis p where p.id = v_autor;
    select p.nome into v_nome_pessoa from public.perfis p where p.id = p_perfil;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (case when v_empresa then p_perfil else v_autor end, 'contratacao', p_anuncio, usuario,
            case when v_empresa
                 then coalesce(v_nome_autor, 'Quem contratou você') || ' quer mostrar no Publike que contratou você em “'
                      || v_titulo || '”. Você topa?'
                 else coalesce(v_nome_pessoa, 'Quem você contratou') || ' quer mostrar no Publike que foi contratado em “'
                      || v_titulo || '”. Você topa?'
            end);
  end if;
end
$function$;

CREATE OR REPLACE FUNCTION privado.perfil_virou_agencia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- um aviso por dia para a mesma conta (trocar de CNPJ várias vezes não enche a caixa da equipe)
  if new.tipo = 'agencia' and (old.tipo <> 'agencia' or new.cnpj is distinct from old.cnpj)
     and not exists (select 1 from privado.fila_emails f
                      where f.modelo = 'aviso_cadastro' and f.dados ->> 'caminho' = '/admin/usuarios/' || new.id
                        and f.criado_em > now() - interval '1 day') then
    perform privado.avisar_equipe('aviso_cadastro', jsonb_build_object(
      'nome', new.nome,
      'tipo', 'agência de emprego / RH; confira o CNPJ ' || coalesce(new.cnpj, '') || ' e verifique a conta',
      'cidade', new.cidade,
      'caminho', '/admin/usuarios/' || new.id));
  end if;
  return null;
end
$function$;

CREATE OR REPLACE FUNCTION public.avaliar(p_anuncio uuid, p_nota integer, p_comentario text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  usuario uuid := (select auth.uid());
  a public.anuncios;
  atual public.avaliacoes;
  texto text := nullif(btrim(regexp_replace(coalesce(p_comentario, ''), '[ \t]+', ' ', 'g')), '');
  v_id bigint;
  esperar boolean := false;
begin
  if usuario is null then
    raise exception 'Entre na sua conta para avaliar.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if p_nota is null or p_nota not between 1 and 5 then
    raise exception 'Escolha de 1 a 5 estrelas.' using errcode = 'P0001';
  end if;
  if char_length(texto) > 600 then
    raise exception 'Use no máximo 600 letras no comentário.' using errcode = 'P0001';
  end if;
  if public.tem_contato(texto, true) then
    raise exception 'Tire o telefone, e-mail ou link do comentário.' using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  select * into a from public.anuncios where id = p_anuncio;
  if not found or a.tipo <> 'servico' then
    raise exception 'Só dá para avaliar serviços.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.curtidas c
     where c.anuncio_id = p_anuncio and c.perfil_id = usuario
       and (c.status = 'match' or (c.status = 'desfeito' and c.desfeito_por = a.autor_id))
  ) then
    raise exception 'Só avalia quem deu match com este serviço.' using errcode = 'P0001', hint = 'sem_match';
  end if;

  select * into atual from public.avaliacoes v where v.anuncio_id = p_anuncio and v.autor_id = usuario for update;
  if found then
    if atual.status in ('retida', 'removida') then
      raise exception 'Sua avaliação está com a moderação e não pode ser mudada agora.' using errcode = 'P0001';
    end if;
    if atual.nota = p_nota and atual.comentario is not distinct from texto then
      return atual.status;
    end if;
    -- cada edição com texto volta para a revisão da IA: tem limite, como a edição de anúncio
    perform privado.conferir_limite('edicao', 40, 'Você editou muitas vezes hoje. Tente de novo amanhã.');
    update public.avaliacoes
       set nota = p_nota, comentario = texto, atualizado_em = now(),
           status = case when texto is null then 'publicada' else 'pendente' end
     where id = atual.id
    returning id into v_id;
  else
    perform privado.conferir_limite('avaliacao', 20, 'Você avaliou muitas vezes hoje. Tente de novo amanhã.');
    insert into public.avaliacoes (anuncio_id, profissional_id, autor_id, titulo_servico, nota, comentario, status)
    values (p_anuncio, a.autor_id, usuario, a.titulo, p_nota, texto,
            case when texto is null then 'publicada' else 'pendente' end)
    returning id into v_id;
  end if;

  if texto is not null then
    esperar := privado.mandar_avaliacao_para_ia(v_id, 'comentario');
    if not esperar then
      update public.avaliacoes set status = 'publicada' where id = v_id;
    end if;
  else
    delete from privado.fila_ia_avaliacoes where avaliacao_id = v_id and parte = 'comentario';
  end if;
  perform privado.avisar_avaliacao_publicada(v_id);
  return case when esperar then 'pendente' else 'publicada' end;
end
$function$;

-- 4. Denúncias ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.denuncias_depois_de_inserir()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Três denúncias de contas diferentes, cada uma com pelo menos 3 dias: o anúncio sai do ar
  -- até a moderação olhar. Contas novas denunciam também, mas sozinhas não tiram nada do ar.
  if (select count(distinct d.autor_id) from public.denuncias d
        join public.perfis p on p.id = d.autor_id
       where d.anuncio_id = new.anuncio_id and d.status = 'aberta'
         and p.criado_em <= now() - interval '3 days') >= 3 then
    perform set_config('publike.sistema', 'on', true);
    update public.anuncios set status = 'em_analise' where id = new.anuncio_id and status = 'ativo';
    perform set_config('publike.sistema', 'off', true);
  end if;
  return null;
end
$function$;

-- 5. Recomendações: só aparecem depois que a pessoa aprova --------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'recomendacoes' and column_name = 'decidida') then
    alter table public.recomendacoes add column decidida boolean not null default false;
    -- as que já estavam no ar continuam
    update public.recomendacoes set decidida = true;
  end if;
end
$$;
alter table public.recomendacoes alter column oculta set default true;

CREATE OR REPLACE FUNCTION public.recomendar(p_profissional uuid, p_relacao text, p_texto text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  usuario uuid := (select auth.uid());
  v_texto text := btrim(coalesce(p_texto, ''));
  v_nome text;
  v_nova boolean;
begin
  if usuario is null then
    raise exception 'Entre na sua conta para recomendar.' using errcode = '42501';
  end if;
  if public.minha_conta_suspensa() then
    raise exception 'Sua conta está suspensa. Se achar que é um engano, fale com a gente.'
      using errcode = 'P0001', hint = 'conta_suspensa';
  end if;
  if p_profissional = usuario then
    raise exception 'Você não pode recomendar a si mesmo.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.perfis p where p.id = p_profissional and p.tipo = 'pessoa') then
    raise exception 'Só dá para recomendar quem presta serviço.' using errcode = '22023';
  end if;
  if p_relacao not in ('vizinho', 'cliente', 'ex_patrao', 'colega') then
    raise exception 'Diga de onde vocês se conhecem.' using errcode = '22023';
  end if;
  if char_length(v_texto) < 10 or char_length(v_texto) > 300 then
    raise exception 'Escreva de 10 a 300 letras.' using errcode = '22023';
  end if;
  if public.tem_contato(v_texto, true) then
    raise exception 'Tire o telefone, e-mail ou link da recomendação.' using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  if exists (select 1 from public.bloqueios b
              where (b.perfil_id = usuario and b.bloqueado_id = p_profissional)
                 or (b.perfil_id = p_profissional and b.bloqueado_id = usuario)) then
    raise exception 'Não é possível recomendar este perfil.' using errcode = '42501';
  end if;
  v_nova := not exists (select 1 from public.recomendacoes r
                         where r.profissional_id = p_profissional and r.autor_id = usuario);
  perform privado.conferir_limite('recomendacao', 10, 'Você já recomendou muita gente hoje. Tente de novo amanhã.');

  -- nova ou mudada: só aparece no perfil depois que a pessoa aprovar
  insert into public.recomendacoes (profissional_id, autor_id, relacao, texto, oculta, decidida)
  values (p_profissional, usuario, p_relacao, v_texto, true, false)
  on conflict (profissional_id, autor_id) do update
    set relacao = excluded.relacao, texto = excluded.texto, atualizado_em = now(),
        oculta = true, decidida = false;

  if v_nova then
    select p.nome into v_nome from public.perfis p where p.id = usuario;
    insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
    values (p_profissional, 'recomendacao', usuario,
            coalesce(v_nome, 'Alguém') || ' recomendou você no Publike. Veja e escolha se aparece no seu perfil.');
  end if;
end
$function$;

CREATE OR REPLACE FUNCTION public.mostrar_recomendacao(p_id bigint, p_mostrar boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.recomendacoes r set oculta = not coalesce(p_mostrar, false), decidida = true
   where r.id = p_id and r.profissional_id = (select auth.uid());
  if not found then
    raise exception 'Recomendação não encontrada.' using errcode = 'P0002';
  end if;
end
$function$;

drop function if exists public.recomendacoes_do_perfil(uuid);
CREATE OR REPLACE FUNCTION public.recomendacoes_do_perfil(p_perfil uuid)
 RETURNS TABLE(id bigint, autor_id uuid, autor_nome text, autor_foto text, relacao text, texto text, oculta boolean, decidida boolean, criado_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select r.id, r.autor_id, p.nome, p.foto, r.relacao, r.texto, r.oculta, r.decidida, r.criado_em
    from public.recomendacoes r
    join public.perfis p on p.id = r.autor_id
   where r.profissional_id = p_perfil
     and (not r.oculta or r.profissional_id = (select auth.uid()) or r.autor_id = (select auth.uid()))
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
   order by r.criado_em desc
   limit 50
$function$;
grant execute on function public.recomendacoes_do_perfil(uuid) to anon, authenticated;

update public.modelos_email
   set corpo = 'Oi, {{nome}}.

{{quem}} escreveu uma recomendação para você no Publike. Ela ajuda quem procura um profissional a confiar em você.

Ela só aparece no seu perfil se você aprovar.'
 where chave = 'recomendacao'
   and corpo = 'Oi, {{nome}}.

{{quem}} deixou uma recomendação no seu perfil do Publike. Ela ajuda quem procura um profissional a confiar em você.

Se não quiser que ela apareça, dá para esconder no seu perfil.';

-- 6. Selo de verificado ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.perfis_antes_de_salvar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  sistema boolean := coalesce(current_setting('publike.sistema', true), '') = 'on';
begin
  if not sistema and new.id = (select auth.uid()) then
    perform privado.exigir_conta_ativa();
  end if;
  new.nome := btrim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  new.bairro := nullif(btrim(regexp_replace(coalesce(new.bairro, ''), '\s+', ' ', 'g')), '');
  new.sobre := nullif(btrim(coalesce(new.sobre, '')), '');
  new.servicos := coalesce(
    (select array_agg(distinct s order by s)
       from (select btrim(x) as s from unnest(new.servicos) as x) t
      where char_length(s) between 2 and 40),
    '{}'
  );
  new.atualizado_em := now();
  if new.foto is not null and split_part(new.foto, '/', 1) <> new.id::text then
    raise exception 'Envie a foto de novo.' using errcode = 'P0001', hint = 'foto_invalida';
  end if;
  -- Confere o texto só quando ele muda: um perfil antigo não trava a
  -- suspensão nem outras mudanças feitas pelo sistema.
  if (tg_op = 'INSERT' or new.nome is distinct from old.nome or new.sobre is distinct from old.sobre
      or new.bairro is distinct from old.bairro or new.cidade is distinct from old.cidade
      or new.servicos is distinct from old.servicos)
     and (public.tem_contato(new.nome) or public.tem_contato(new.sobre, true) or public.tem_contato(new.bairro)
          or public.tem_contato(new.cidade) or public.tem_contato(array_to_string(new.servicos, ' '))) then
    raise exception 'Tire o telefone, e-mail ou link do perfil. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
    if not sistema then
      -- o selo vale para aquele nome, tipo de conta e CNPJ: mudou, a equipe confere de novo
      new.verificado := old.verificado and new.nome is not distinct from old.nome
                        and new.tipo is not distinct from old.tipo and new.cnpj is not distinct from old.cnpj;
      new.suspenso_ate := old.suspenso_ate;
    end if;
  elsif not sistema then
    new.verificado := false;
    new.suspenso_ate := null;
  end if;
  return new;
end
$function$;

-- 7. Moderação --------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moderar_avaliacao(p_avaliacao bigint, p_parte text, p_decisao text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.avaliacoes;
  escritor uuid;
begin
  perform privado.exigir_equipe();
  if p_parte not in ('comentario', 'resposta') or p_decisao not in ('publicar', 'remover') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  select * into v from public.avaliacoes where id = p_avaliacao for update;
  if not found then
    raise exception 'Avaliação não encontrada.' using errcode = 'P0002';
  end if;
  -- quem modera não decide avaliação que escreveu nem a que fala dos serviços dele
  if not privado.eh_admin() and (select auth.uid()) in (v.autor_id, v.profissional_id) then
    raise exception 'Você não pode moderar uma avaliação sua ou sobre você. Deixe para outra pessoa da equipe.'
      using errcode = '42501';
  end if;
  escritor := case when p_parte = 'comentario' then v.autor_id else v.profissional_id end;
  delete from privado.fila_ia_avaliacoes where avaliacao_id = p_avaliacao and parte = p_parte;

  if p_parte = 'comentario' then
    update public.avaliacoes
       set status = case when p_decisao = 'publicar' then 'publicada' else 'removida' end,
           denunciada_em = null, motivo_denuncia = null, atualizado_em = now()
     where id = p_avaliacao;
    if p_decisao = 'publicar' then
      perform privado.avisar_avaliacao_publicada(p_avaliacao);
    end if;
  else
    update public.avaliacoes
       set resposta_status = case when p_decisao = 'publicar' then 'publicada' else 'removida' end,
           atualizado_em = now()
     where id = p_avaliacao;
  end if;

  if p_decisao = 'publicar' then
    delete from public.advertencias a where a.avaliacao_id = p_avaliacao and a.perfil_id = escritor and a.origem = 'ia';
  elsif not exists (select 1 from public.advertencias a where a.avaliacao_id = p_avaliacao and a.perfil_id = escritor) then
    -- removida por denúncia (a IA tinha deixado passar): a advertência vem da equipe
    insert into public.advertencias (perfil_id, origem, motivo, avaliacao_id)
    values (escritor, 'equipe', 'Texto de avaliação removido pela moderação.', p_avaliacao);
  end if;

  perform privado.registrar(case when p_decisao = 'publicar' then 'publicar_avaliacao' else 'remover_avaliacao' end,
                            'avaliacao', p_avaliacao::text, v.titulo_servico,
                            jsonb_build_object('parte', p_parte, 'escritor', escritor));
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_matches_desfeitos(p_perfil uuid)
 RETURNS TABLE(id bigint, anuncio_id uuid, titulo text, tipo_anuncio text, fez boolean, outro_id uuid, outro_nome text, motivo text, justificativa text, futuro boolean, match_em timestamp with time zone, criado_em timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform privado.exigir_admin();
  return query
    select d.id, d.anuncio_id, d.titulo, d.tipo_anuncio, d.desfeito_por = p_perfil,
           case when d.desfeito_por = p_perfil then d.outro_id else d.desfeito_por end,
           p.nome, d.motivo, d.justificativa, d.futuro, d.match_em, d.criado_em
      from public.matches_desfeitos d
      left join public.perfis p
        on p.id = case when d.desfeito_por = p_perfil then d.outro_id else d.desfeito_por end
     where d.desfeito_por = p_perfil or d.outro_id = p_perfil
     order by d.criado_em desc
     limit 100;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_advertencias(p_usuario uuid)
 RETURNS TABLE(id bigint, origem text, motivo text, avaliacao_id bigint, criado_em timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
    select a.id, a.origem, a.motivo, a.avaliacao_id, a.criado_em
      from public.advertencias a where a.perfil_id = p_usuario order by a.criado_em desc;
end
$function$;

revoke execute on function public.admin_matches_desfeitos(uuid), public.admin_advertencias(uuid) from public, anon, authenticated;
grant execute on function public.admin_matches_desfeitos(uuid), public.admin_advertencias(uuid) to service_role;

-- 8. Empresa contratante mudou: o anúncio volta para a revisão da IA -------------------

create or replace function privado.conteudo_revisado(a public.anuncios)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws(chr(31), a.tipo, a.titulo, a.descricao, a.categoria, a.regime, a.pagamento_valor::text,
                       a.pagamento_unidade, a.beneficios, a.horario, a.vagas::text, a.oficio,
                       array_to_string(a.fotos, ','), a.contratante, a.contratante_confidencial::text))
$$;

drop trigger if exists anuncios_revisao_ia on public.anuncios;
create trigger anuncios_revisao_ia
  after insert or update of titulo, descricao, categoria, regime, pagamento_valor, pagamento_unidade,
                            beneficios, horario, vagas, oficio, fotos, contratante, contratante_confidencial
  on public.anuncios
  for each row execute function privado.anuncio_para_revisao_ia();

-- 9. Sugestões ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enviar_sugestao(p_tipo text, p_texto text, p_pagina text, p_email text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  usuario uuid := (select auth.uid());
  v_texto text := btrim(regexp_replace(coalesce(p_texto, ''), '[[:space:]]+$', ''));
  v_pagina text := nullif(btrim(coalesce(p_pagina, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  novo bigint;
begin
  if p_tipo is null or p_tipo not in ('erro', 'sugestao', 'elogio', 'melhoria') then
    raise exception 'Escolha o que você quer mandar: erro, sugestão, elogio ou melhoria.' using errcode = 'P0001';
  end if;
  if char_length(v_texto) < 10 then
    raise exception 'Conte um pouco mais (pelo menos 10 letras).' using errcode = 'P0001';
  end if;
  if char_length(v_texto) > 2000 then
    raise exception 'O texto passou de 2.000 letras. Resuma um pouco.' using errcode = 'P0001';
  end if;
  if v_email is not null and (char_length(v_email) > 200 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Confira o e-mail.' using errcode = 'P0001';
  end if;
  -- só caminho do próprio site: nada de "//", barra invertida ou caractere de controle
  if v_pagina is not null and (char_length(v_pagina) > 300 or v_pagina !~ '^/' or v_pagina ~ '^//'
                               or strpos(v_pagina, chr(92)) > 0 or v_pagina ~ '[[:cntrl:]]') then
    v_pagina := null;
  end if;

  if usuario is not null then
    if (select count(*) from public.sugestoes s
         where s.autor_id = usuario and s.criado_em > now() - interval '1 hour') >= 10 then
      raise exception 'Você mandou muitas mensagens na última hora. Tente de novo mais tarde.' using errcode = 'P0001';
    end if;
  elsif (select count(*) from public.sugestoes s
          where s.autor_id is null and s.criado_em > now() - interval '1 hour') >= 60 then
    raise exception 'Recebemos muitas mensagens agora. Tente de novo daqui a pouco.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sugestoes s
              where s.texto = v_texto and s.criado_em > now() - interval '1 day'
                and s.autor_id is not distinct from usuario) then
    raise exception 'Essa mensagem já chegou. Obrigado!' using errcode = 'P0001';
  end if;

  insert into public.sugestoes (tipo, texto, pagina, email, autor_id)
  values (p_tipo, v_texto, v_pagina, v_email, usuario)
  returning id into novo;
  return novo;
end
$function$;

-- 10. Assistente ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.servidor_usar_assistente(p_chave text, p_quem text, p_limite integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  agora timestamptz := date_trunc('hour', now());
  v_total integer;
begin
  perform privado.exigir_servidor(p_chave);
  if p_quem is null or p_quem !~ '^(u|ip):[0-9a-f-]{8,64}$' then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  if not coalesce((select c.chat_ativo from public.config_site c limit 1), false) then
    return false;
  end if;
  -- de vez em quando, limpa as contas antigas
  if random() < 0.02 then
    delete from privado.uso_chat u where u.hora < now() - interval '2 days';
  end if;
  -- teto geral: com muita gente ao mesmo tempo (ou muitos endereços de um robô), o gasto da IA não dispara
  if (select coalesce(sum(u.total), 0) from privado.uso_chat u where u.hora = agora) >= 600 then
    raise exception 'O assistente está com muita procura agora. Tente de novo daqui a pouco.'
      using errcode = 'P0001', hint = 'chat_cheio';
  end if;
  insert into privado.uso_chat as u (quem, hora, total) values (p_quem, agora, 1)
  on conflict (quem, hora) do update set total = u.total + 1
  returning u.total into v_total;
  return v_total <= least(greatest(coalesce(p_limite, 15), 1), 500);
end
$function$;

-- a API do Supabase passa a ver a função nova (registrar_aceite) na hora
notify pgrst, 'reload schema';
