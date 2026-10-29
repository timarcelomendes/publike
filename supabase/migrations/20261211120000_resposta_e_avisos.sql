-- Resposta rápida e avisos de vaga (29/10/2026; plano em claude/plano-liquidez.md, itens 1 e 2). Pode rodar de novo.
--   * a curtida (e-mail, sino e celular) abre a ficha de quem curtiu na Caixa de entrada, com o Aceitar e o Dispensar;
--   * lembrete para quem publicou: curtida sem resposta há 24 h e há 72 h (um aviso por vaga, das 8h às 20h);
--   * quem curtiu fica sabendo: com 5 dias sem resposta, um aviso com as vagas parecidas (um por dia, no máximo);
--   * o e-mail de vaga nova de uma busca com aviso sai no máximo um a cada 20 horas (o sino continua avisando cada vaga).
-- Só conta curtida dos últimos 30 dias, em vaga no ar, de quem publicou e já entrou alguma vez (a de quem nunca
-- entrou vira match em 48 h por privado.liberar_contatos_parados).

-- 1. Os tipos novos no sino ------------------------------------------------------------------------

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
                  'teste_pedido', 'teste_feito', 'lembrete_curtida', 'sem_resposta'));

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
                    'lembrete_curtida', 'sem_resposta') then 'andamento'
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
                     'lembrete_curtida', 'sem_resposta'))
  execute function privado.notificacao_para_celular();

-- 2. O e-mail: os caminhos e a trava do aviso de vaga nova ----------------------------------------

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
                  'liberado', 'lembrete_curtida', 'sem_resposta') then
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
$$;

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
  v_grupo text := privado.grupo_do_aviso(p_modelo);
  v_sair jsonb := '{}'::jsonb;
begin
  select * into cfg from public.config_site limit 1;
  if not found or not cfg.emails_ativos then
    return;
  end if;
  if (p_modelo = 'curtida' and not cfg.email_curtida)
     or (p_modelo = 'match' and not cfg.email_match)
     or (p_modelo in ('em_analise', 'removido', 'liberado') and not cfg.email_moderacao)
     or (de_conta and not cfg.email_conta)
     or (p_modelo like 'boas\_vindas\_%' and not cfg.email_boas_vindas) then
    return;
  end if;
  -- avisos de conta vão mesmo para quem desligou os avisos
  if not de_conta then
    select c.receber_emails into quer from public.contatos c where c.perfil_id = p_usuario;
    if quer is false then
      return;
    end if;
  end if;
  -- o que a conta desligou na página Avisos e notificações (os avisos sem grupo chegam sempre)
  if v_grupo is not null and privado.aviso_desligado(p_usuario, p_modelo, 'email') then
    return;
  end if;
  -- vaga nova de uma busca com aviso: o sino avisa cada uma; o e-mail, no máximo um a cada 20 horas
  if p_modelo = 'busca' and exists (
    select 1 from privado.fila_emails f
     where f.usuario_id = p_usuario and f.modelo = 'busca' and f.criado_em > now() - interval '20 hours'
  ) then
    return;
  end if;
  -- avisos que podem se repetir: no máximo um do mesmo tipo a cada 30 minutos para a mesma pessoa
  if p_modelo in ('curtida', 'etapa', 'contratacao', 'recomendacao', 'seguindo', 'mensagem', 'convite',
                  'lembrete_curtida') and exists (
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
  -- o "parar de receber" deste grupo (o rodapé e o cabeçalho List-Unsubscribe); sem a chave, o e-mail sai
  -- assim mesmo, com o rodapé de antes
  if v_grupo is not null then
    begin
      v_sair := jsonb_build_object('sair', privado.chave_de_aviso(p_usuario), 'grupo_aviso', v_grupo);
    exception
      when others then
        v_sair := '{}'::jsonb;
    end;
  end if;
  insert into privado.fila_emails (modelo, para, usuario_id, dados)
  values (p_modelo, lower(destino), p_usuario,
          jsonb_build_object('nome', coalesce(privado.nome_para_email(p_usuario), ''))
          || coalesce(p_dados, '{}'::jsonb) || jsonb_strip_nulls(v_sair));
exception
  when others then
    raise warning 'Publike: e-mail % não entrou na fila (%).', p_modelo, sqlerrm;
end
$function$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('lembrete_curtida', 'usuarios', 2, 'Lembrete de curtida sem resposta',
     'Para quem publicou: curtidas sem resposta há 24 h e há 72 h (um por vaga, das 8h às 20h).',
     array['nome', 'titulo', 'motivo', 'link'],
     'Tem gente esperando sua resposta em “{{titulo}}”',
     'Oi, {{nome}}!

{{motivo}}

Responder rápido faz a vaga aparecer na frente e mostra o selo de quem responde rápido. Aceitar libera o WhatsApp de vocês dois; dispensar avisa a pessoa para ela seguir procurando.',
     'Responder agora'),
    ('sem_resposta', 'usuarios', 22, 'Curtida sem resposta há 5 dias',
     'Para quem curtiu: a vaga ainda não respondeu em 5 dias. Leva às vagas parecidas (no máximo um por dia).',
     array['nome', 'titulo', 'motivo', 'link'],
     'Ainda sem resposta sobre “{{titulo}}”',
     'Oi, {{nome}}!

{{motivo}}

Sua curtida continua valendo: se a empresa aceitar, você recebe o aviso. Enquanto isso, curta outras vagas para aumentar suas chances.',
     'Ver vagas parecidas')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- o botão da curtida leva à decisão (só no texto que ninguém mudou)
update public.modelos_email
   set botao = case when botao = botao_padrao then 'Responder agora' else botao end,
       botao_padrao = 'Responder agora'
 where chave = 'curtida';

-- 3. Os lembretes -----------------------------------------------------------------------------------

create table if not exists privado.lembretes_curtida (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  etapa text not null check (etapa in ('24h', '72h', 'sem_resposta')),
  enviado_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id, etapa)
);
alter table privado.lembretes_curtida enable row level security;
revoke all on table privado.lembretes_curtida from public, anon, authenticated;

-- p_agora: a hora, para o teste
create or replace function privado.lembrar_respostas(p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from p_agora at time zone 'America/Sao_Paulo');
  v_etapa text;
  v_n integer;
  v_empresa integer := 0;
  v_pessoa integer := 0;
begin
  -- de madrugada e à noite, nada (fica para a próxima rodada das 8h)
  if v_hora < 8 or v_hora >= 20 then
    return jsonb_build_object('fora_do_horario', true);
  end if;

  -- quem publicou: primeiro a de 72 h (a curtida que passou das 72 h sem a de 24 h ganha só esta)
  foreach v_etapa in array array['72h', '24h'] loop
    with pendentes as (
      select c.anuncio_id, c.perfil_id, a.autor_id, a.titulo
        from public.curtidas c
        join public.anuncios a on a.id = c.anuncio_id
        join auth.users u on u.id = a.autor_id
       where c.status = 'pendente' and c.aceita_em is null
         and a.tipo = 'vaga' and a.status = 'ativo' and a.expira_em > p_agora
         and u.last_sign_in_at is not null
         and c.criado_em > p_agora - interval '30 days'
         and c.criado_em < p_agora - case v_etapa when '24h' then interval '24 hours' else interval '72 hours' end
         and not exists (select 1 from privado.lembretes_curtida l
                          where l.anuncio_id = c.anuncio_id and l.perfil_id = c.perfil_id
                            and l.etapa in (v_etapa, '72h'))
    ),
    marcadas as (
      insert into privado.lembretes_curtida (anuncio_id, perfil_id, etapa)
      select p.anuncio_id, p.perfil_id, v_etapa from pendentes p
      on conflict do nothing
      returning anuncio_id, perfil_id
    ),
    por_vaga as (
      select p.anuncio_id, p.autor_id, p.titulo, count(*) as n, (array_agg(p.perfil_id))[1] as alguem
        from pendentes p
        join marcadas m on m.anuncio_id = p.anuncio_id and m.perfil_id = p.perfil_id
       group by p.anuncio_id, p.autor_id, p.titulo
    )
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    select v.autor_id, 'lembrete_curtida', v.anuncio_id, v.alguem,
           case when v.n = 1 then '1 pessoa espera' else v.n || ' pessoas esperam' end
           || ' sua resposta em “' || v.titulo || '” há mais de '
           || case v_etapa when '24h' then 'um dia' else '3 dias' end || '.'
      from por_vaga v;
    get diagnostics v_n = row_count;
    v_empresa := v_empresa + v_n;
  end loop;

  -- quem curtiu: 5 dias sem resposta, uma vaga por pessoa por dia
  with pendentes as (
    select c.anuncio_id, c.perfil_id, c.criado_em, a.titulo, a.autor_id,
           case when a.contratante_confidencial then 'A empresa' else coalesce(nullif(btrim(a.contratante), ''), pa.nome, 'A empresa') end as empresa
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      left join public.perfis pa on pa.id = a.autor_id
     where c.status = 'pendente' and c.aceita_em is null
       and a.tipo = 'vaga' and a.status = 'ativo' and a.expira_em > p_agora
       and c.criado_em > p_agora - interval '30 days'
       and c.criado_em < p_agora - interval '5 days'
       and not exists (select 1 from privado.lembretes_curtida l
                        where l.anuncio_id = c.anuncio_id and l.perfil_id = c.perfil_id and l.etapa = 'sem_resposta')
       and not exists (select 1 from public.notificacoes n
                        where n.destinatario_id = c.perfil_id and n.tipo = 'sem_resposta'
                          and n.criado_em > p_agora - interval '20 hours')
  ),
  escolhidas as (
    select distinct on (p.perfil_id) p.* from pendentes p order by p.perfil_id, p.criado_em
  ),
  marcadas as (
    insert into privado.lembretes_curtida (anuncio_id, perfil_id, etapa)
    select e.anuncio_id, e.perfil_id, 'sem_resposta' from escolhidas e
    on conflict do nothing
    returning anuncio_id, perfil_id
  )
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  select e.perfil_id, 'sem_resposta', e.anuncio_id, e.autor_id,
         e.empresa || ' ainda não respondeu sobre “' || e.titulo || '”. Veja vagas parecidas perto de você.'
    from escolhidas e
    join marcadas m on m.anuncio_id = e.anuncio_id and m.perfil_id = e.perfil_id;
  get diagnostics v_pessoa = row_count;

  return jsonb_build_object('empresa', v_empresa, 'pessoa', v_pessoa);
end
$$;
revoke execute on function privado.lembrar_respostas(timestamptz) from public, anon, authenticated;

create or replace function public.servidor_lembrar_respostas(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return privado.lembrar_respostas();
end
$$;
revoke execute on function public.servidor_lembrar_respostas(text) from public;
grant execute on function public.servidor_lembrar_respostas(text) to anon, authenticated, service_role;
