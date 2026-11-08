-- Busca E/OU e buscas salvas em Talentos (08/11/2026; claude/plano-pedido-do-cliente-convites-e-testes.md, parte 5).
-- Pode rodar de novo.
--
-- 1. privado.termos_da_busca e privado.bate_busca: o texto da busca vira grupos de palavras.
--      caixa atendente          as duas (em qualquer ordem; antes, o texto inteiro junto)
--      caixa OU atendente       qualquer uma
--      "auxiliar administrativo" a frase exata
--      -motorista               sem essa palavra
-- 2. buscar_talentos usa a regra nova (o resto igual à definição de agora).
-- 3. buscas_talentos: até 20 buscas salvas por conta, com o aviso de talento novo uma vez por semana (opcional).
-- 4. servidor_avisar_buscas_talentos: o robô das filas avisa (sino, celular e e-mail "Talentos novos na sua busca").

-- 1. As palavras da busca ---------------------------------------------------------------------------------------------

-- {"e": [["caixa", "atendente"], ["auxiliar administrativo"]], "nao": ["motorista"]}: todos os grupos de "e" (cada
-- grupo vale se uma das palavras bater) e nenhuma de "nao". Sem acento e em minúsculas; até 10 termos.
create or replace function privado.termos_da_busca(p_texto text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  m text[];
  termo text;
  negar boolean;
  ou boolean := false;
  grupos jsonb := '[]'::jsonb;
  nao jsonb := '[]'::jsonb;
  n integer := 0;
begin
  for m in select regexp_matches(coalesce(p_texto, ''), '(-?)"([^"]*)"|(\S+)', 'g') loop
    exit when n >= 10;
    if m[3] is not null and upper(m[3]) in ('OU', 'OR') then
      ou := jsonb_array_length(grupos) > 0;
      continue;
    end if;
    if m[3] is not null then
      negar := left(m[3], 1) = '-' and char_length(m[3]) > 1;
      termo := case when negar then substr(m[3], 2) else m[3] end;
    else
      negar := m[1] = '-';
      termo := m[2];
    end if;
    termo := btrim(lower(public.sem_acento(regexp_replace(termo, '\s+', ' ', 'g'))), ' .,;:!?()');
    if termo = '' then
      continue;
    end if;
    n := n + 1;
    if negar then
      nao := nao || to_jsonb(termo);
    elsif ou then
      grupos := jsonb_set(grupos, array[(jsonb_array_length(grupos) - 1)::text],
                          (grupos -> (jsonb_array_length(grupos) - 1)) || to_jsonb(termo));
    else
      grupos := grupos || jsonb_build_array(jsonb_build_array(termo));
    end if;
    ou := false;
  end loop;
  return jsonb_build_object('e', grupos, 'nao', nao);
end
$$;

-- O texto (já sem acento e em minúsculas) bate com os termos?
create or replace function privado.bate_busca(p_alvo text, p_termos jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
           select 1 from jsonb_array_elements(coalesce(p_termos -> 'e', '[]'::jsonb)) g
            where not exists (
              select 1 from jsonb_array_elements_text(g.value) t
               where strpos(p_alvo, t) > 0))
     and not exists (
           select 1 from jsonb_array_elements_text(coalesce(p_termos -> 'nao', '[]'::jsonb)) t
            where strpos(p_alvo, t) > 0)
$$;

-- O que a busca de Talentos lê de cada currículo: o título, as habilidades, os cursos e os cargos.
create or replace function privado.texto_do_talento(c public.curriculos)
returns text
language sql
stable
set search_path = ''
as $$
  select lower(public.sem_acento(concat_ws(' ', c.titulo, array_to_string(c.habilidades, ' '),
           array_to_string(c.cursos, ' '), c.curso,
           (select string_agg(e ->> 'cargo', ' ') from jsonb_array_elements(c.experiencias) e))))
$$;

-- 2. A busca de Talentos ----------------------------------------------------------------------------------------------

create or replace function public.buscar_talentos(
  p_texto text default null,
  p_cidade text default null,
  p_bairro text default null,
  p_limite integer default 24,
  p_deslocamento integer default 0
)
returns table (perfil_id uuid, nome text, cidade text, bairro text, titulo text, habilidades text[], cursos text[],
               escolaridade text, cnh text, disponibilidade text[], cargos text[], meses_experiencia integer,
               atualizado_em timestamptz, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  eu uuid := (select public.conta_atual());
  termos jsonb := privado.termos_da_busca(p_texto);
  sem_termos boolean;
begin
  sem_termos := jsonb_array_length(termos -> 'e') = 0 and jsonb_array_length(termos -> 'nao') = 0;
  return query
  select p.id, privado.nome_curto(p.nome), p.cidade, p.bairro, c.titulo, c.habilidades, c.cursos,
         c.escolaridade, c.cnh, c.disponibilidade, privado.cargos_do_curriculo(c.experiencias),
         privado.meses_de_experiencia(c.experiencias), c.atualizado_em, count(*) over ()
    from public.curriculo_na_vitrine n
    join public.curriculos c on c.perfil_id = n.perfil_id
    join public.perfis p on p.id = n.perfil_id
   where p.tipo = 'pessoa'
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and (eu is null or not privado.ha_bloqueio(eu, p.id))
     and (p_cidade is null or lower(p.cidade) = lower(p_cidade))
     and (sem_termos or privado.bate_busca(privado.texto_do_talento(c), termos))
   order by (p_bairro is not null and lower(coalesce(p.bairro, '')) = lower(p_bairro)) desc, c.atualizado_em desc
   limit least(greatest(coalesce(p_limite, 24), 1), 48)
  offset least(greatest(coalesce(p_deslocamento, 0), 0), 480);
end
$$;
revoke execute on function public.buscar_talentos(text, text, text, integer, integer) from public;
grant execute on function public.buscar_talentos(text, text, text, integer, integer) to anon, authenticated;

-- 3. As buscas salvas -------------------------------------------------------------------------------------------------

create table if not exists public.buscas_talentos (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null default public.conta_atual() references public.perfis (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 60),
  texto text check (char_length(texto) <= 120),
  cidade text check (char_length(cidade) <= 60),
  avisar boolean not null default false,
  avisado_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint buscas_talentos_algo check (texto is not null or cidade is not null)
);
comment on table public.buscas_talentos is 'As buscas salvas de Talentos de quem contrata (até 20 por conta).';
create index if not exists buscas_talentos_conta_idx on public.buscas_talentos (conta_id, criado_em desc);
create unique index if not exists buscas_talentos_nome_idx on public.buscas_talentos (conta_id, lower(nome));
alter table public.buscas_talentos enable row level security;
revoke all on public.buscas_talentos from anon, authenticated;
grant select, delete on public.buscas_talentos to authenticated;
grant update (avisar) on public.buscas_talentos to authenticated;
drop policy if exists "a conta vê as suas buscas" on public.buscas_talentos;
create policy "a conta vê as suas buscas" on public.buscas_talentos
  for select to authenticated using (conta_id = (select public.conta_atual()));
drop policy if exists "a conta apaga as suas buscas" on public.buscas_talentos;
create policy "a conta apaga as suas buscas" on public.buscas_talentos
  for delete to authenticated using (conta_id = (select public.conta_atual()));
drop policy if exists "a conta muda o aviso das suas buscas" on public.buscas_talentos;
create policy "a conta muda o aviso das suas buscas" on public.buscas_talentos
  for update to authenticated using (conta_id = (select public.conta_atual()))
  with check (conta_id = (select public.conta_atual()));

-- Salvar (ou atualizar a de mesmo nome). Só quem contrata; até 20 por conta.
create or replace function public.salvar_busca_talentos(p_nome text, p_texto text, p_cidade text, p_avisar boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v_nome text := left(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), 60);
  v_texto text := nullif(left(btrim(coalesce(p_texto, '')), 120), '');
  v_cidade text := nullif(left(btrim(coalesce(p_cidade, '')), 60), '');
  id_salvo uuid;
begin
  perform privado.exigir_conta_ativa();
  if conta is null or not exists (select 1 from public.perfis p where p.id = conta and p.tipo <> 'pessoa') then
    raise exception 'Buscas salvas são para quem contrata.' using errcode = '42501';
  end if;
  if char_length(v_nome) < 2 then
    raise exception 'Dê um nome à busca.' using errcode = 'P0001';
  end if;
  if v_texto is null and v_cidade is null then
    raise exception 'Escreva o que procurar ou escolha a cidade.' using errcode = 'P0001';
  end if;
  select b.id into id_salvo from public.buscas_talentos b where b.conta_id = conta and lower(b.nome) = lower(v_nome);
  if id_salvo is not null then
    update public.buscas_talentos set texto = v_texto, cidade = v_cidade, avisar = coalesce(p_avisar, false)
     where id = id_salvo;
    return id_salvo;
  end if;
  if (select count(*) from public.buscas_talentos b where b.conta_id = conta) >= 20 then
    raise exception 'Você já tem 20 buscas salvas. Apague uma para salvar outra.' using errcode = 'P0001';
  end if;
  insert into public.buscas_talentos (conta_id, nome, texto, cidade, avisar)
  values (conta, v_nome, v_texto, v_cidade, coalesce(p_avisar, false))
  returning id into id_salvo;
  return id_salvo;
end
$$;
revoke execute on function public.salvar_busca_talentos(text, text, text, boolean) from public, anon;
grant execute on function public.salvar_busca_talentos(text, text, text, boolean) to authenticated;

-- 4. O aviso da semana --------------------------------------------------------------------------------------------------

-- As buscas com o aviso ligado, uma vez a cada 7 dias: quantos talentos entraram ou atualizaram o currículo desde o
-- último aviso (ou desde que a busca foi salva). Até 100 buscas por rodada. Devolve quantas contas foram avisadas.
create or replace function public.servidor_avisar_buscas_talentos(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  novos integer;
  avisadas integer := 0;
  termos jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  for b in
    select x.* from public.buscas_talentos x
      join public.perfis p on p.id = x.conta_id
     where x.avisar and (p.suspenso_ate is null or p.suspenso_ate < now())
       and coalesce(x.avisado_em, x.criado_em) < now() - interval '7 days'
     order by coalesce(x.avisado_em, x.criado_em)
     limit 100
  loop
    termos := privado.termos_da_busca(b.texto);
    select count(*) into novos
      from public.curriculo_na_vitrine n
      join public.curriculos c on c.perfil_id = n.perfil_id
      join public.perfis p on p.id = n.perfil_id
     where p.tipo = 'pessoa'
       and (p.suspenso_ate is null or p.suspenso_ate < now())
       and c.atualizado_em > coalesce(b.avisado_em, b.criado_em)
       and (b.cidade is null or lower(p.cidade) = lower(b.cidade))
       and privado.bate_busca(privado.texto_do_talento(c), termos)
       and not privado.ha_bloqueio(b.conta_id, p.id);
    update public.buscas_talentos set avisado_em = now() where id = b.id;
    if novos > 0 then
      insert into public.notificacoes (destinatario_id, tipo, texto, link)
      values (b.conta_id, 'busca_talentos',
              left(case when novos = 1 then '1 talento novo ou com currículo atualizado' else novos || ' talentos novos ou com currículo atualizado' end
                   || ' na sua busca “' || b.nome || '”, em Talentos.', 300),
              '/talentos?ver=todos' || case when b.texto is not null then '&q=' || replace(replace(b.texto, '&', '%26'), ' ', '+') else '' end
                || case when b.cidade is not null then '&cidade=' || replace(b.cidade, ' ', '+') else '' end);
      avisadas := avisadas + 1;
    end if;
  end loop;
  return avisadas;
end
$$;
revoke execute on function public.servidor_avisar_buscas_talentos(text) from public;
grant execute on function public.servidor_avisar_buscas_talentos(text) to anon, authenticated, service_role;


-- O aviso novo: busca_talentos (as definições de agora, com o tipo novo) ------------------------------------------------------

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check CHECK ((tipo = ANY (ARRAY['curtida'::text, 'match'::text, 'em_analise'::text, 'removido'::text, 'liberado'::text, 'avaliacao'::text, 'avaliacao_retida'::text, 'match_desfeito'::text, 'etapa'::text, 'mensagem'::text, 'seguindo'::text, 'recomendacao'::text, 'contratacao'::text, 'entrevista'::text, 'entrevista_resposta'::text, 'aceite_curriculo'::text, 'curriculo_recebido'::text, 'busca'::text, 'convite'::text, 'vaga_preenchida'::text, 'finalistas'::text, 'convite_candidato'::text, 'equipe'::text, 'conexao'::text, 'recado_no_ar'::text, 'recado_retido'::text, 'recado_forca'::text, 'convite_curriculo'::text, 'convite_empresa'::text, 'convite_agencia'::text, 'convite_servicos'::text, 'convite_vitrine'::text, 'curriculo_publico'::text, 'visita'::text, 'visitas_do_dia'::text, 'visitas_novidade'::text, 'avaliacao_liberada'::text, 'avaliacao_removida'::text, 'mensagem_equipe'::text, 'vagas_semana'::text, 'talentos_semana'::text, 'comunicado'::text, 'noticias_do_dia'::text, 'teste_pedido'::text, 'teste_feito'::text, 'lembrete_curtida'::text, 'sem_resposta'::text, 'pagamento'::text, 'dispensada'::text, 'entrevista_lembrete'::text, 'video_pedido'::text, 'video_enviado'::text, 'parados'::text, 'proposta'::text, 'proposta_resposta'::text, 'candidatura_recebida'::text, 'talentos_reativar'::text, 'match_empresa'::text, 'matches_sem_contato'::text, 'respostas_match'::text, 'liberacao'::text, 'talento_combina'::text, 'pedido_cliente'::text, 'busca_talentos'::text])));

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
                    'match_empresa', 'matches_sem_contato', 'respostas_match', 'talento_combina', 'pedido_cliente', 'busca_talentos') then 'andamento'
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
                  'match_empresa', 'matches_sem_contato', 'respostas_match', 'liberacao', 'talento_combina', 'pedido_cliente', 'busca_talentos') then
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
                 -- o pedido de vaga do cliente da agência: a página dos pedidos
                 when 'busca_talentos' then coalesce(new.link, '/talentos')
                 when 'pedido_cliente' then coalesce(new.link, '/painel/pedidos')
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
CREATE TRIGGER notificacoes_para_celular AFTER INSERT ON public.notificacoes FOR EACH ROW WHEN ((new.tipo = ANY (ARRAY['curtida'::text, 'match'::text, 'mensagem'::text, 'conexao'::text, 'em_analise'::text, 'removido'::text, 'liberado'::text, 'etapa'::text, 'entrevista'::text, 'entrevista_resposta'::text, 'contratacao'::text, 'aceite_curriculo'::text, 'curriculo_recebido'::text, 'convite'::text, 'convite_candidato'::text, 'finalistas'::text, 'vaga_preenchida'::text, 'seguindo'::text, 'busca'::text, 'avaliacao'::text, 'recado_retido'::text, 'mensagem_equipe'::text, 'equipe'::text, 'vagas_semana'::text, 'talentos_semana'::text, 'noticias_do_dia'::text, 'teste_pedido'::text, 'teste_feito'::text, 'lembrete_curtida'::text, 'sem_resposta'::text, 'pagamento'::text, 'dispensada'::text, 'entrevista_lembrete'::text, 'video_pedido'::text, 'video_enviado'::text, 'parados'::text, 'proposta'::text, 'proposta_resposta'::text, 'candidatura_recebida'::text, 'talentos_reativar'::text, 'match_empresa'::text, 'matches_sem_contato'::text, 'respostas_match'::text, 'liberacao'::text, 'talento_combina'::text, 'pedido_cliente'::text, 'busca_talentos'::text]))) EXECUTE FUNCTION privado.notificacao_para_celular();

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('busca_talentos', 'usuarios', 7, 'Talentos novos na busca salva',
     'Para quem contrata: uma vez por semana, quantos talentos novos (ou com currículo atualizado) batem com uma busca salva de Talentos que está com o aviso ligado.',
     array['nome', 'motivo', 'link'],
     'Talentos novos na sua busca',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver os talentos')
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

notify pgrst, 'reload schema';
