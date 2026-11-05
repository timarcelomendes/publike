-- Quem contrata (05/11/2026; claude/plano-talento-que-combina.md):
--   1. não recebe "Vaga nova na sua busca" (o aviso de busca salva fica só para conta de pessoa);
--   2. recebe "Chegou um candidato que combina com a sua vaga" (talento_combina): quando uma pessoa da aba Talentos
--      monta ou muda o currículo e combina 70% ou mais com uma vaga no ar da conta (a conta do % fica no site: o
--      robô das filas lê os currículos mudados e pede ao banco para avisar). Uma vez por pessoa e vaga, no máximo
--      3 por conta por dia. Só os currículos que mudarem daqui para frente. Pode rodar de novo.

-- 1. O aviso de busca: só para pessoa -------------------------------------------------------------------------------
create or replace function privado.avisar_buscas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lugar text;
begin
  if new.tipo <> 'vaga' or new.status <> 'ativo' or (tg_op = 'UPDATE' and old.status = 'ativo') then
    return null;
  end if;
  -- só a primeira vez que entra no ar (pausar e reativar não avisa de novo)
  insert into privado.avisos_busca (anuncio_id) values (new.id) on conflict do nothing;
  if not found then
    return null;
  end if;
  v_lugar := coalesce(nullif(btrim(coalesce(new.bairro, '')), ''), new.cidade);

  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  select q.perfil_id, 'busca', new.id, new.autor_id,
         'Vaga nova na sua busca ' || q.rotulo || ': “' || new.titulo || '”, em ' || v_lugar || '.'
    from (
      select distinct on (b.perfil_id) b.perfil_id, b.rotulo
        from public.buscas_salvas b
        -- só quem procura trabalho (conta de pessoa): empresa, comércio e agência não seguem vagas dos outros
        join public.perfis pb on pb.id = b.perfil_id and pb.tipo = 'pessoa'
       where b.perfil_id <> new.autor_id
         and extensions.st_dwithin(new.local,
                                   extensions.st_setsrid(extensions.st_makepoint(b.lng, b.lat), 4326)::extensions.geography,
                                   b.raio_km * 1000)
         and (b.categoria is null or b.categoria = new.categoria)
         and (b.regime is null or b.regime = new.regime)
         and (b.texto is null
              or new.busca @@ websearch_to_tsquery('portuguese'::regconfig, public.sem_acento(b.texto))
              or public.sem_acento(new.titulo) ilike '%' || public.sem_acento(b.texto) || '%')
         and privado.vaga_no_turno(new, b.turno)
       order by b.perfil_id, b.id
    ) q
   -- no máximo 5 avisos destes por pessoa por dia
   where (select count(*) from public.notificacoes n
           where n.destinatario_id = q.perfil_id and n.tipo = 'busca'
             and n.criado_em > now() - interval '24 hours') < 5
     and not exists (select 1 from public.bloqueios b
                      where (b.perfil_id = q.perfil_id and b.bloqueado_id = new.autor_id)
                         or (b.perfil_id = new.autor_id and b.bloqueado_id = q.perfil_id));
  return null;
end
$$;

-- 2. O aviso novo ---------------------------------------------------------------------------------------------------
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida', 'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao', 'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca', 'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao', 'recado_no_ar', 'recado_retido', 'recado_forca', 'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine', 'curriculo_publico', 'visita', 'visitas_do_dia', 'visitas_novidade', 'avaliacao_liberada', 'avaliacao_removida', 'mensagem_equipe', 'vagas_semana', 'talentos_semana', 'comunicado', 'noticias_do_dia', 'teste_pedido', 'teste_feito', 'lembrete_curtida', 'sem_resposta', 'pagamento', 'dispensada', 'entrevista_lembrete', 'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida', 'talentos_reativar', 'match_empresa', 'matches_sem_contato', 'respostas_match', 'liberacao', 'talento_combina'));

CREATE OR REPLACE FUNCTION privado.grupo_do_aviso(p_tipo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_tipo = 'mensagem' then 'mensagens'
    when p_tipo in ('curtida', 'match', 'match_desfeito', 'etapa', 'contratacao', 'entrevista', 'entrevista_resposta',
                    'aceite_curriculo', 'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas',
                    'vaga_preenchida', 'recomendacao', 'avaliacao', 'teste_pedido', 'teste_feito',
                    'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                    'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida',
                    'match_empresa', 'matches_sem_contato', 'respostas_match', 'talento_combina') then 'andamento'
    when p_tipo = 'conexao' then 'conexoes'
    when p_tipo in ('busca', 'seguindo') then 'vagas_novas'
    when p_tipo in ('vagas_semana', 'talentos_semana', 'talentos_reativar', 'resumo_vagas') then 'semana'
    when p_tipo in ('convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos',
                    'convite_vitrine') then 'convites'
    when p_tipo = 'noticias_do_dia' then 'noticias'
    else null
  end
$function$;

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
                  'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida',
                  'match_empresa', 'matches_sem_contato', 'respostas_match', 'liberacao', 'talento_combina') then
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
                 when 'match_empresa' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 when 'matches_sem_contato' then '/painel/matches'
                 when 'respostas_match' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 -- a funcionalidade liberada: a página dela (o link vem do banco, só caminho do site)
                 when 'liberacao' then coalesce(new.link, '/painel')
                 -- o candidato que combina: a ficha dele em Talentos
                 when 'talento_combina' then coalesce(new.link, '/talentos')
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
                 when 'candidatura_recebida' then '/painel/curtidas'
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

drop trigger if exists notificacoes_para_celular on public.notificacoes;
create trigger notificacoes_para_celular
  after insert on public.notificacoes
  for each row
  when (new.tipo in ('curtida', 'match', 'mensagem', 'conexao', 'em_analise', 'removido', 'liberado', 'etapa', 'entrevista', 'entrevista_resposta', 'contratacao', 'aceite_curriculo', 'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas', 'vaga_preenchida', 'seguindo', 'busca', 'avaliacao', 'recado_retido', 'mensagem_equipe', 'equipe', 'vagas_semana', 'talentos_semana', 'noticias_do_dia', 'teste_pedido', 'teste_feito', 'lembrete_curtida', 'sem_resposta', 'pagamento', 'dispensada', 'entrevista_lembrete', 'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida', 'talentos_reativar', 'match_empresa', 'matches_sem_contato', 'respostas_match', 'liberacao', 'talento_combina'))
  execute function privado.notificacao_para_celular();

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('talento_combina', 'usuarios', 5, 'Candidato que combina',
     'Para quem contrata: uma pessoa da aba Talentos montou ou mudou o currículo e combina 70% ou mais com uma vaga no ar da conta. Uma vez por pessoa e vaga, no máximo 3 por conta por dia.',
     array['nome', 'motivo', 'link'],
     'Chegou um candidato que combina com a sua vaga',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver o candidato')
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

-- no máximo um e-mail destes a cada 60 minutos para a mesma conta (o sino recebe todos)
insert into privado.regras_email (modelo, intervalo_min) values ('talento_combina', 60)
on conflict (modelo) do nothing;

-- 3. Quem já foi avisado e até onde o robô leu ----------------------------------------------------------------------
create table if not exists privado.talentos_avisados (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  avisado_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id)
);
alter table privado.talentos_avisados enable row level security;
revoke all on privado.talentos_avisados from public, anon, authenticated;

create table if not exists privado.leitura_de_talentos (
  id integer primary key default 1 check (id = 1),
  ate timestamptz not null default now()
);
alter table privado.leitura_de_talentos enable row level security;
revoke all on privado.leitura_de_talentos from public, anon, authenticated;
-- a estreia: só o que mudar daqui para frente
insert into privado.leitura_de_talentos (id, ate) values (1, now()) on conflict (id) do nothing;

-- os currículos da aba Talentos que mudaram desde a última leitura (os mais antigos primeiro)
create or replace function public.servidor_talentos_mudados(p_chave text, p_limite integer default 30)
returns table (perfil_id uuid, nome text, cidade text, bairro text, curriculo jsonb, atualizado_em timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select p.id, privado.nome_curto(p.nome), p.cidade, p.bairro, to_jsonb(c), c.atualizado_em
    from public.curriculo_na_vitrine v
    join public.perfis p on p.id = v.perfil_id
    join public.curriculos c on c.perfil_id = p.id
   where p.tipo = 'pessoa' and not coalesce(p.suspenso_ate > now(), false)
     and c.atualizado_em > (select l.ate from privado.leitura_de_talentos l where l.id = 1)
   order by c.atualizado_em
   limit least(greatest(coalesce(p_limite, 30), 1), 100);
end
$$;

-- até onde já leu (só anda para frente)
create or replace function public.servidor_talentos_lidos_ate(p_chave text, p_ate timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.leitura_de_talentos set ate = greatest(ate, p_ate) where id = 1;
end
$$;

-- as contas com vaga no ar (as vagas e quem não avisar: já curtiu, já é conexão)
create or replace function public.servidor_contas_com_vagas(p_chave text)
returns table (conta_id uuid, vagas jsonb, ja uuid[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select p.id,
         (select jsonb_agg(jsonb_build_object(
                   'id', a.id, 'titulo', a.titulo, 'descricao', a.descricao,
                   'escolaridade_minima', a.escolaridade_minima, 'experiencia', a.experiencia, 'cnh', a.cnh,
                   'cidade', a.cidade, 'bairro', a.bairro, 'jornada', a.jornada,
                   'horario_detalhe', a.horario_detalhe, 'horario', a.horario) order by a.criado_em desc)
            from public.anuncios a
           where a.autor_id = p.id and a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
             and a.expira_em > now()),
         array(select cu.perfil_id from public.curtidas cu join public.anuncios a on a.id = cu.anuncio_id
                where a.autor_id = p.id
               union select x.talento_id from public.conexoes x where x.empresa_id = p.id)
    from public.perfis p
   where p.tipo in ('empresa', 'comercio', 'agencia') and not coalesce(p.suspenso_ate > now(), false)
     and exists (select 1 from public.anuncios a
                  where a.autor_id = p.id and a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
                    and a.expira_em > now());
end
$$;

-- avisa a conta (true: avisou). Confere de novo: a vaga é da conta e está no ar, não avisou antes desta pessoa
-- nesta vaga, ninguém bloqueou ninguém, a pessoa não curtiu a vaga e a conta não passou de 3 hoje.
create or replace function public.servidor_avisar_talento(
  p_chave text, p_conta uuid, p_anuncio uuid, p_perfil uuid, p_texto text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if not exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.autor_id = p_conta and a.tipo = 'vaga' and a.status = 'ativo') then
    return false;
  end if;
  if exists (select 1 from privado.talentos_avisados t where t.anuncio_id = p_anuncio and t.perfil_id = p_perfil)
     or exists (select 1 from public.curtidas cu where cu.anuncio_id = p_anuncio and cu.perfil_id = p_perfil)
     or exists (select 1 from public.bloqueios b
                 where (b.perfil_id = p_conta and b.bloqueado_id = p_perfil)
                    or (b.perfil_id = p_perfil and b.bloqueado_id = p_conta))
     or (select count(*) from public.notificacoes n
          where n.destinatario_id = p_conta and n.tipo = 'talento_combina'
            and n.criado_em > now() - interval '24 hours') >= 3 then
    return false;
  end if;
  insert into privado.talentos_avisados (anuncio_id, perfil_id) values (p_anuncio, p_perfil);
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
  values (p_conta, 'talento_combina', p_anuncio, p_perfil, left(p_texto, 300), '/talentos/' || p_perfil);
  return true;
end
$$;

revoke execute on function public.servidor_talentos_mudados(text, integer),
  public.servidor_talentos_lidos_ate(text, timestamptz), public.servidor_contas_com_vagas(text),
  public.servidor_avisar_talento(text, uuid, uuid, uuid, text) from public;
grant execute on function public.servidor_talentos_mudados(text, integer),
  public.servidor_talentos_lidos_ate(text, timestamptz), public.servidor_contas_com_vagas(text),
  public.servidor_avisar_talento(text, uuid, uuid, uuid, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
