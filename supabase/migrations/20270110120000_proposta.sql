-- Proposta e admissão (claude/plano-recursos-concorrentes.md, parte 7). Pode rodar de novo.
--   * "Fazer proposta" (com match): o salário, o início, o horário, os benefícios, um recado e o primeiro dia (onde,
--     a que horas e o que trazer). Uma proposta por pessoa e vaga; mudar antes da resposta manda de novo.
--   * o candidato aceita ou recusa pelo Publike; a resposta fica registrada com data e hora (é um registro, não uma
--     assinatura eletrônica). Aceitar leva a pessoa para Contratados.
--   * decisão 4 do plano: o Publike não guarda CPF, RG, PIS nem conta bancária; a lista diz só o que levar.
-- Avisos novos: `proposta` (para o candidato) e `proposta_resposta` (para a empresa).
-- Rode depois de 20270109120000_automacoes_e_numeros.sql.

-- 1. A proposta ------------------------------------------------------------------------------------------
create table if not exists public.propostas (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  salario text not null check (char_length(btrim(salario)) between 2 and 80),
  inicio date not null,
  horario text check (horario is null or char_length(horario) <= 120),
  beneficios text check (beneficios is null or char_length(beneficios) <= 300),
  recado text check (recado is null or char_length(recado) <= 600),
  apresentar_onde text check (apresentar_onde is null or char_length(apresentar_onde) <= 300),
  apresentar_hora time,
  -- o que levar no primeiro dia (os nomes; nenhum número de documento fica aqui)
  documentos text[] not null default '{}' check (cardinality(documentos) <= 12),
  situacao text not null default 'enviada' check (situacao in ('enviada', 'aceita', 'recusada', 'cancelada')),
  motivo_recusa text check (motivo_recusa is null or char_length(motivo_recusa) <= 300),
  enviada_em timestamptz not null default now(),
  respondida_em timestamptz,
  enviada_por uuid references public.perfis (id) on delete set null,
  unique (anuncio_id, perfil_id)
);
alter table public.propostas enable row level security;
revoke all on table public.propostas from public, anon, authenticated;

create or replace function privado.proposta_em_json(p public.propostas)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'anuncio_id', p.anuncio_id, 'perfil_id', p.perfil_id, 'salario', p.salario, 'inicio', p.inicio,
    'horario', p.horario, 'beneficios', p.beneficios, 'recado', p.recado, 'apresentar_onde', p.apresentar_onde,
    'apresentar_hora', to_char(p.apresentar_hora, 'HH24:MI'), 'documentos', to_jsonb(p.documentos),
    'situacao', p.situacao, 'motivo_recusa', p.motivo_recusa, 'enviada_em', p.enviada_em,
    'respondida_em', p.respondida_em)
$$;

-- 2. Para a empresa --------------------------------------------------------------------------------------
create or replace function public.fazer_proposta(p_anuncio uuid, p_perfil uuid, p_dados jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
  v_atual public.propostas;
  v_id uuid;
  v_inicio date;
  v_hora time;
  v_docs text[];
  v_empresa text;
begin
  perform privado.exigir_conta_ativa();
  select * into a from public.anuncios x where x.id = p_anuncio and x.autor_id = public.conta_atual();
  if not found or a.tipo <> 'vaga' then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.curtidas c where c.anuncio_id = a.id and c.perfil_id = p_perfil and c.status = 'match') then
    raise exception 'A proposta vai para quem já deu match.' using errcode = 'P0001';
  end if;
  select * into v_atual from public.propostas p where p.anuncio_id = a.id and p.perfil_id = p_perfil;
  if found and v_atual.situacao = 'aceita' then
    raise exception 'Esta pessoa já aceitou a proposta.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_dados ->> 'salario', ''))) < 2 then
    raise exception 'Escreva o salário.' using errcode = '22023';
  end if;
  begin
    v_inicio := (p_dados ->> 'inicio')::date;
    v_hora := nullif(p_dados ->> 'apresentar_hora', '')::time;
  exception when others then
    raise exception 'Confira a data de início e a hora.' using errcode = '22023';
  end;
  if v_inicio is null or v_inicio < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O início não pode ser no passado.' using errcode = '22023';
  end if;
  select coalesce(array_agg(left(btrim(d), 60)) filter (where btrim(d) <> ''), '{}') into v_docs
    from jsonb_array_elements_text(coalesce(p_dados -> 'documentos', '[]'::jsonb)) d;
  insert into public.propostas (anuncio_id, perfil_id, salario, inicio, horario, beneficios, recado,
                                apresentar_onde, apresentar_hora, documentos, situacao, motivo_recusa, enviada_em,
                                respondida_em, enviada_por)
  values (a.id, p_perfil, left(btrim(p_dados ->> 'salario'), 80), v_inicio,
          nullif(left(btrim(coalesce(p_dados ->> 'horario', '')), 120), ''),
          nullif(left(btrim(coalesce(p_dados ->> 'beneficios', '')), 300), ''),
          nullif(left(btrim(coalesce(p_dados ->> 'recado', '')), 600), ''),
          nullif(left(btrim(coalesce(p_dados ->> 'apresentar_onde', '')), 300), ''),
          v_hora, v_docs[1:12], 'enviada', null, now(), null, (select auth.uid()))
  on conflict (anuncio_id, perfil_id) do update
    set salario = excluded.salario, inicio = excluded.inicio, horario = excluded.horario,
        beneficios = excluded.beneficios, recado = excluded.recado, apresentar_onde = excluded.apresentar_onde,
        apresentar_hora = excluded.apresentar_hora, documentos = excluded.documentos, situacao = 'enviada',
        motivo_recusa = null, enviada_em = now(), respondida_em = null, enviada_por = excluded.enviada_por
  returning id into v_id;
  select p.nome into v_empresa from public.perfis p where p.id = a.autor_id;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'proposta', a.id, a.autor_id,
          left(coalesce(v_empresa, 'A empresa')
               || case when v_atual.id is null then ' mandou uma proposta' else ' mudou a proposta' end
               || ' para a vaga “' || a.titulo || '”. Veja e responda pelo Publike.', 300));
  return v_id;
end
$$;

create or replace function public.cancelar_proposta(p_anuncio uuid, p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  update public.propostas set situacao = 'cancelada', respondida_em = null
   where anuncio_id = p_anuncio and perfil_id = p_perfil and situacao = 'enviada';
  if not found then
    raise exception 'Só dá para cancelar a proposta que ainda espera resposta.' using errcode = 'P0001';
  end if;
end
$$;

create or replace function public.propostas_da_vaga(p_anuncio uuid)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  return query select privado.proposta_em_json(p) from public.propostas p where p.anuncio_id = p_anuncio;
end
$$;

-- 3. Para o candidato ------------------------------------------------------------------------------------
create or replace function public.minha_proposta(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.propostas;
  a public.anuncios;
begin
  select * into p from public.propostas x
   where x.anuncio_id = p_anuncio and x.perfil_id = (select auth.uid()) and x.situacao <> 'cancelada';
  if not found then
    return null;
  end if;
  select * into a from public.anuncios x where x.id = p_anuncio;
  return privado.proposta_em_json(p) || jsonb_build_object(
    'vaga', a.titulo,
    'empresa', (select e.nome from public.perfis e where e.id = a.autor_id),
    'empresa_id', a.autor_id);
end
$$;

create or replace function public.responder_proposta(p_anuncio uuid, p_aceitar boolean, p_motivo text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  p public.propostas;
  a public.anuncios;
  v_nome text;
begin
  perform privado.exigir_conta_ativa();
  select * into p from public.propostas x where x.anuncio_id = p_anuncio and x.perfil_id = eu for update;
  if not found or p.situacao = 'cancelada' then
    raise exception 'Proposta não encontrada.' using errcode = 'P0002';
  end if;
  if p.situacao <> 'enviada' then
    raise exception 'Você já respondeu esta proposta.' using errcode = 'P0001';
  end if;
  select * into a from public.anuncios x where x.id = p_anuncio;
  update public.propostas
     set situacao = case when p_aceitar then 'aceita' else 'recusada' end,
         respondida_em = now(),
         motivo_recusa = case when p_aceitar then null else nullif(left(btrim(coalesce(p_motivo, '')), 300), '') end
   where id = p.id;
  if p_aceitar then
    insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa)
    values (p_anuncio, eu, 'contratado')
    on conflict (anuncio_id, perfil_id) do update set etapa = 'contratado', atualizado_em = now();
  end if;
  select split_part(x.nome, ' ', 1) into v_nome from public.perfis x where x.id = eu;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (a.autor_id, 'proposta_resposta', a.id, eu,
          left(coalesce(v_nome, 'O candidato')
               || case when p_aceitar then ' aceitou a proposta para “' || a.titulo || '”. Começa em '
                                         || to_char(p.inicio, 'DD/MM') || '.'
                       else ' recusou a proposta para “' || a.titulo || '”.'
                            || coalesce(' Motivo: ' || nullif(left(btrim(coalesce(p_motivo, '')), 200), ''), '') end,
               300));
  return case when p_aceitar then 'aceita' else 'recusada' end;
end
$$;

-- 4. Os avisos `proposta` e `proposta_resposta` (o mesmo da 20270109120000, com os dois) --------------
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
                  'dispensada', 'entrevista_lembrete',
                  'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta'));

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
                    'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                    'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta') then 'andamento'
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
                     'lembrete_curtida', 'sem_resposta', 'pagamento', 'dispensada', 'entrevista_lembrete',
                     'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta'))
  execute function privado.notificacao_para_celular();

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
                  'liberado', 'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                  'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta') then
    v_motivo := new.texto;
  end if;
  -- entrevista: os dados para o convite de agenda (.ics) que vai anexo no e-mail
  if new.tipo in ('entrevista', 'entrevista_resposta', 'entrevista_lembrete') then
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
                 when 'video_pedido' then '/entrevista-video/' || new.anuncio_id
                 when 'video_enviado' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 when 'parados' then '/painel/anuncio/' || new.anuncio_id || '/quadro'
                 when 'proposta' then '/proposta/' || new.anuncio_id
                 when 'proposta_resposta' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 when 'entrevista_lembrete' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                        else '/anuncio/' || new.anuncio_id end
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
    ('proposta', 'usuarios', 22, 'Proposta de trabalho',
     'Para o candidato: a empresa mandou (ou mudou) a proposta.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     'Proposta para a vaga “{{titulo}}”',
     'Oi, {{nome}}.

{{motivo}}

O salário, o início e o seu primeiro dia estão na proposta.',
     'Ver a proposta'),
    ('proposta_resposta', 'usuarios', 22, 'Resposta à proposta',
     'Para quem publicou a vaga: o candidato aceitou ou recusou a proposta.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     '{{quem}} respondeu a proposta',
     'Oi, {{nome}}.

{{motivo}}',
     'Abrir o quadro')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- 5. Permissões -----------------------------------------------------------------------------------------
revoke all on function privado.proposta_em_json(public.propostas) from public, anon, authenticated;
revoke all on function public.fazer_proposta(uuid, uuid, jsonb), public.cancelar_proposta(uuid, uuid),
                       public.propostas_da_vaga(uuid), public.minha_proposta(uuid),
                       public.responder_proposta(uuid, boolean, text)
  from public, anon;
grant execute on function public.fazer_proposta(uuid, uuid, jsonb), public.cancelar_proposta(uuid, uuid),
                          public.propostas_da_vaga(uuid), public.minha_proposta(uuid),
                          public.responder_proposta(uuid, boolean, text)
  to authenticated;

notify pgrst, 'reload schema';
