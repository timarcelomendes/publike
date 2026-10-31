-- Retorno a quem não seguiu (claude/plano-retorno-e-whatsapp.md, parte 1). Pode rodar de novo.
-- Hoje, quem é dispensado numa vaga não recebe aviso nenhum. Agora:
--   * a conta escolhe o texto do retorno (ou desliga); sem escolha, vale o texto padrão, ligado;
--   * dispensar põe o retorno na espera por 15 minutos (dá para desfazer) e a tarefa das filas manda das
--     8h às 20h (Brasília): o aviso `dispensada` no sino, no celular e no e-mail, com as vagas parecidas;
--   * "Não seguiu" depois do match usa o mesmo texto da conta.

-- 1. A escolha da conta ------------------------------------------------------------------------
create table if not exists privado.retorno_contas (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  ligado boolean not null default true,
  texto text check (texto is null or char_length(texto) between 20 and 400),
  atualizado_em timestamptz not null default now()
);
alter table privado.retorno_contas enable row level security;
revoke all on table privado.retorno_contas from public, anon, authenticated;

create or replace function privado.retorno_padrao()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Oi, {nome}! Obrigado pelo interesse na vaga de {vaga}. Desta vez {empresa} não vai seguir com a sua '
         || 'candidatura. Continue procurando: tem vagas parecidas perto de você.'
$$;

-- o texto pronto para uma pessoa (null: a conta desligou o retorno)
create or replace function privado.montar_retorno(p_conta uuid, p_perfil uuid, p_anuncio uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r privado.retorno_contas;
  v_texto text;
begin
  select * into r from privado.retorno_contas x where x.conta_id = p_conta;
  if found and not r.ligado then
    return null;
  end if;
  v_texto := coalesce(r.texto, privado.retorno_padrao());
  v_texto := replace(v_texto, '{nome}', coalesce((select split_part(p.nome, ' ', 1) from public.perfis p where p.id = p_perfil), ''));
  v_texto := replace(v_texto, '{vaga}', coalesce((select a.titulo from public.anuncios a where a.id = p_anuncio), 'a vaga'));
  v_texto := replace(v_texto, '{empresa}', coalesce((select p.nome from public.perfis p where p.id = p_conta), 'a empresa'));
  return left(v_texto, 600);
end
$$;

create or replace function public.retorno_da_conta()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r privado.retorno_contas;
begin
  if (select public.conta_atual()) is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  select * into r from privado.retorno_contas x where x.conta_id = (select public.conta_atual());
  return jsonb_build_object('ligado', coalesce(r.ligado, true), 'texto', r.texto, 'padrao', privado.retorno_padrao());
end
$$;

create or replace function public.salvar_retorno(p_ligado boolean, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v_texto text := nullif(btrim(regexp_replace(coalesce(p_texto, ''), '[[:space:]]+', ' ', 'g')), '');
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta muda o retorno.' using errcode = '42501';
  end if;
  if v_texto is not null and char_length(v_texto) not between 20 and 400 then
    raise exception 'O texto precisa ter de 20 a 400 letras.' using errcode = '22023', hint = 'texto';
  end if;
  -- sem contato e sem link: o retorno não abre conversa por fora do Publike
  if v_texto ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|[0-9][0-9 ().-]{7,}[0-9])' then
    raise exception 'Tire telefone, e-mail e link do texto.' using errcode = '22023', hint = 'texto';
  end if;
  insert into privado.retorno_contas (conta_id, ligado, texto, atualizado_em)
  values (conta, coalesce(p_ligado, true), v_texto, now())
  on conflict (conta_id) do update
    set ligado = excluded.ligado, texto = excluded.texto, atualizado_em = now();
end
$$;

-- 2. A espera de 15 minutos ---------------------------------------------------------------------
create table if not exists privado.retornos_pendentes (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  enviar_em timestamptz not null,
  primary key (anuncio_id, perfil_id)
);
create index if not exists retornos_pendentes_quando on privado.retornos_pendentes (enviar_em);
alter table privado.retornos_pendentes enable row level security;
revoke all on table privado.retornos_pendentes from public, anon, authenticated;

create or replace function privado.curtida_retorno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'dispensada' and old.status = 'pendente'
     and exists (select 1 from public.anuncios a where a.id = new.anuncio_id and a.tipo = 'vaga') then
    insert into privado.retornos_pendentes (anuncio_id, perfil_id, enviar_em)
    values (new.anuncio_id, new.perfil_id, now() + interval '15 minutes')
    on conflict (anuncio_id, perfil_id) do update set enviar_em = excluded.enviar_em;
  elsif new.status <> 'dispensada' then
    delete from privado.retornos_pendentes p where p.anuncio_id = new.anuncio_id and p.perfil_id = new.perfil_id;
  end if;
  return null;
end
$$;

drop trigger if exists curtidas_retorno on public.curtidas;
create trigger curtidas_retorno
  after update of status on public.curtidas
  for each row execute function privado.curtida_retorno();

-- 3. A tarefa das filas manda (das 8h às 20h) ---------------------------------------------------
create or replace function public.servidor_retornos(p_chave text, p_agora timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_texto text;
  v_hora integer := extract(hour from (p_agora at time zone 'America/Sao_Paulo'))::integer;
  feitos integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  if v_hora < 8 or v_hora >= 20 then
    return 0;
  end if;
  for r in
    select p.anuncio_id, p.perfil_id, a.autor_id, c.status
      from privado.retornos_pendentes p
      join public.anuncios a on a.id = p.anuncio_id
      left join public.curtidas c on c.anuncio_id = p.anuncio_id and c.perfil_id = p.perfil_id
     where p.enviar_em <= p_agora
     order by p.enviar_em
     limit 200
  loop
    delete from privado.retornos_pendentes p where p.anuncio_id = r.anuncio_id and p.perfil_id = r.perfil_id;
    if r.status is distinct from 'dispensada' then
      continue;
    end if;
    v_texto := privado.montar_retorno(r.autor_id, r.perfil_id, r.anuncio_id);
    if v_texto is null then
      continue;
    end if;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
    values (r.perfil_id, 'dispensada', r.anuncio_id, r.autor_id, v_texto, '/anuncio/' || r.anuncio_id || '/parecidas');
    feitos := feitos + 1;
  end loop;
  return feitos;
end
$$;

-- 4. O aviso novo ------------------------------------------------------------------------------
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'recado_no_ar', 'recado_retido', 'recado_forca',
                  'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine',
                  'curriculo_publico', 'visita', 'visitas_do_dia', 'visitas_novidade',
                  'avaliacao_liberada', 'avaliacao_removida', 'mensagem_equipe',
                  'vagas_semana', 'talentos_semana', 'comunicado', 'noticias_do_dia',
                  'teste_pedido', 'teste_feito', 'lembrete_curtida', 'sem_resposta', 'pagamento',
                  'dispensada'));

create or replace function privado.grupo_do_aviso(p_tipo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tipo = 'mensagem' then 'mensagens'
    when p_tipo in ('curtida', 'match', 'match_desfeito', 'etapa', 'contratacao', 'entrevista', 'entrevista_resposta',
                    'aceite_curriculo', 'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas',
                    'vaga_preenchida', 'recomendacao', 'avaliacao', 'teste_pedido', 'teste_feito',
                    'lembrete_curtida', 'sem_resposta', 'dispensada') then 'andamento'
    when p_tipo = 'conexao' then 'conexoes'
    when p_tipo in ('busca', 'seguindo') then 'vagas_novas'
    when p_tipo in ('vagas_semana', 'talentos_semana') then 'semana'
    when p_tipo in ('convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos',
                    'convite_vitrine') then 'convites'
    when p_tipo = 'noticias_do_dia' then 'noticias'
    else null
  end
$$;

drop trigger if exists notificacoes_para_celular on public.notificacoes;
create trigger notificacoes_para_celular
  after insert on public.notificacoes
  for each row
  when (new.tipo in ('curtida', 'match', 'mensagem', 'conexao', 'em_analise', 'removido', 'liberado',
                     'etapa', 'entrevista', 'entrevista_resposta', 'contratacao', 'aceite_curriculo',
                     'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas', 'vaga_preenchida',
                     'seguindo', 'busca', 'avaliacao', 'recado_retido', 'mensagem_equipe', 'equipe',
                     'vagas_semana', 'talentos_semana', 'noticias_do_dia', 'teste_pedido', 'teste_feito',
                     'lembrete_curtida', 'sem_resposta', 'pagamento', 'dispensada'))
  execute function privado.notificacao_para_celular();

-- o e-mail do aviso (o gatilho notificacoes_por_email já manda todo tipo que não está na lista dele):
-- o texto vai em {{motivo}} e o botão leva às vagas parecidas
CREATE OR REPLACE FUNCTION privado.notificacao_por_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_titulo text;
  v_nota text;
  v_quem text;
  v_autor uuid;
  v_motivo text;
  v_futuro boolean;
  v_depois text;
  v_entrevista jsonb;
  v_status text;
  v_categoria text;
begin
  select a.titulo, a.nota_moderacao, a.autor_id, a.status, a.categoria into v_titulo, v_nota, v_autor, v_status, v_categoria
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
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'liberado', 'lembrete_curtida', 'sem_resposta', 'dispensada') then
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
                 -- a ficha de quem curtiu na Caixa de entrada, com o Aceitar e o Dispensar (o serviço volta para o anúncio)
                 when 'curtida' then '/painel/caixa?aba=responder&c=' || new.anuncio_id || ':' || new.ator_id
                 when 'lembrete_curtida' then '/painel/caixa?aba=responder&vaga=' || new.anuncio_id
                 when 'sem_resposta' then '/?tipo=vaga&categoria=' || coalesce(v_categoria, 'outros')
                 when 'dispensada' then '/anuncio/' || new.anuncio_id || '/parecidas'
                 when 'match' then '/painel/matches'
                 when 'liberado' then
                   case when v_status = 'ativo' then '/anuncio/' || new.anuncio_id else '/painel/anuncios' end
                 when 'removido' then '/privacidade#regras'
                 when 'avaliacao' then '/painel/avaliacoes'
                 when 'avaliacao_retida' then '/privacidade#regras'
                 when 'match_desfeito' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/anuncio/' || new.anuncio_id end
                 when 'etapa' then '/painel/curtidas'
                 when 'mensagem' then coalesce('/painel/conversas/' || new.ator_id, '/painel/conversas')
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
$function$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('dispensada', 'usuarios', 23, 'Retorno de quem não seguiu',
     'Para quem curtiu: a empresa não vai seguir com a candidatura (15 minutos depois de dispensar, das 8h às 20h). O texto é o da empresa.',
     array['nome', 'titulo', 'motivo', 'link'],
     'Sobre a vaga “{{titulo}}”',
     '{{motivo}}

Sua procura não para aqui: veja as vagas parecidas e curta as que combinam com você.',
     'Ver vagas parecidas')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- 5. "Não seguiu" depois do match usa o texto da conta ------------------------------------------
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
  if (select public.conta_atual()) is null then
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
     and a.autor_id = (select public.conta_atual());
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
    -- vaga encerrada depois do match: o retorno da conta (migração 20261230120000), se estiver ligado
    v_aviso := case when p_etapa = 'nao_seguiu' and v_tipo = 'vaga'
                         and privado.montar_retorno((select auth.uid()), p_perfil, p_anuncio) is not null
                    then privado.montar_retorno((select auth.uid()), p_perfil, p_anuncio)
                    when p_etapa = 'nao_seguiu'
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
      values (p_perfil, 'etapa', p_anuncio, (select public.conta_atual()), v_aviso);
    end if;
  end if;
end
$function$;

revoke all on function privado.montar_retorno(uuid, uuid, uuid), privado.retorno_padrao() from public, anon, authenticated;
revoke all on function public.retorno_da_conta(), public.salvar_retorno(boolean, text) from public, anon;
grant execute on function public.retorno_da_conta(), public.salvar_retorno(boolean, text) to authenticated;
revoke all on function public.servidor_retornos(text, timestamptz) from public;
grant execute on function public.servidor_retornos(text, timestamptz) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
