-- Vaga preenchida e prazo escolhido por quem publica.
--
-- 1. Vaga preenchida: quem publicou marca, a vaga continua no site com a marcação “Vaga
--    preenchida”, ninguém mais curte, e quem estava interessado recebe o aviso (no sino e
--    por e-mail). Dá para reabrir.
-- 2. Prazo da vaga: quem publica escolhe em quantos dias a vaga sai do ar sozinha (7, 15,
--    30, 60, 90 ou outro número), ou nenhum: a vaga fica no ar até ser encerrada. Sem prazo,
--    a data de saída fica em 31/12/9999 (as comparações com now() continuam valendo).
--    As vagas de antes ficam com 30 dias; serviços continuam com 90.
--
-- Rode depois de 20261019120000_contato_direto.sql. Pode rodar de novo.

alter table public.anuncios add column if not exists preenchida_em timestamptz;
alter table public.anuncios add column if not exists prazo_dias smallint default 30;
alter table public.anuncios drop constraint if exists anuncios_prazo_dias_check;
alter table public.anuncios add constraint anuncios_prazo_dias_check check (prazo_dias is null or prazo_dias between 1 and 365);
grant insert (prazo_dias), update (prazo_dias) on public.anuncios to authenticated;

-- A data de saída da vaga segue o prazo escolhido (ao publicar, renovar, voltar ao ar ou
-- mudar o prazo). Roda depois dos outros gatilhos do anúncio ("zz").
create or replace function privado.anuncio_prazo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo <> 'vaga' then
    return new;
  end if;
  if tg_op = 'INSERT' or new.prazo_dias is distinct from old.prazo_dias or new.expira_em is distinct from old.expira_em then
    new.expira_em := case when new.prazo_dias is null then timestamptz '9999-12-31 00:00:00+00'
                          else now() + make_interval(days => new.prazo_dias) end;
  end if;
  return new;
end
$$;
drop trigger if exists anuncios_zz_prazo on public.anuncios;
create trigger anuncios_zz_prazo
  before insert or update on public.anuncios
  for each row execute function privado.anuncio_prazo();

-- Vaga preenchida não recebe curtida nova (nem “curtir de novo”)
create or replace function privado.curtida_em_vaga_preenchida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and not (new.status = 'pendente' and old.status = 'desfeito') then
    return new;
  end if;
  if exists (select 1 from public.anuncios a where a.id = new.anuncio_id and a.preenchida_em is not null) then
    raise exception 'Esta vaga já foi preenchida. Veja outras vagas perto de você.'
      using errcode = 'P0001', hint = 'preenchida';
  end if;
  return new;
end
$$;
drop trigger if exists curtidas_vaga_preenchida on public.curtidas;
create trigger curtidas_vaga_preenchida
  before insert or update of status on public.curtidas
  for each row execute function privado.curtida_em_vaga_preenchida();

-- O aviso novo
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida'));

-- Marcar (ou desmarcar) a vaga como preenchida. Ao marcar, avisa quem curtiu e ainda está
-- esperando ou deu match (menos quem foi contratado nela). Devolve quantos foram avisados.
create or replace function public.marcar_vaga_preenchida(p_id uuid, p_preenchida boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  a public.anuncios;
  avisados integer := 0;
begin
  perform privado.exigir_conta_ativa();
  select * into a from public.anuncios where id = p_id and autor_id = eu for update;
  if not found or a.tipo <> 'vaga' then
    raise exception 'Vaga não encontrada.' using errcode = 'P0002';
  end if;
  if a.status in ('em_analise', 'removido') then
    raise exception 'Esta vaga está com a moderação. Marque depois que ela for liberada.'
      using errcode = 'P0001', hint = 'com_moderacao';
  end if;
  if p_preenchida then
    if a.preenchida_em is not null then
      return 0;
    end if;
    update public.anuncios set preenchida_em = now() where id = p_id;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    select c.perfil_id, 'vaga_preenchida', a.id, eu,
           left('A vaga “' || a.titulo || '” foi preenchida. Obrigado pelo interesse! Veja outras vagas perto de você.', 300)
      from public.curtidas c
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where c.anuncio_id = a.id
       and c.status in ('pendente', 'match')
       and coalesce(e.etapa, 'novo') <> 'contratado';
    get diagnostics avisados = row_count;
  else
    update public.anuncios set preenchida_em = null where id = p_id;
  end if;
  return avisados;
end
$$;
revoke execute on function public.marcar_vaga_preenchida(uuid, boolean) from public, anon;
grant execute on function public.marcar_vaga_preenchida(uuid, boolean) to authenticated;

-- E-mail do aviso (o caminho leva para as vagas perto)
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
                  'convite', 'vaga_preenchida') then
    v_motivo := new.texto;
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
                 else '/painel'
               end));
  return null;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('vaga_preenchida', 'usuarios', 23, 'Vaga preenchida',
     'Quando quem publicou marca a vaga como preenchida: vai para quem curtiu e ainda esperava (ou deu match), menos quem foi contratado.',
     array['nome', 'titulo', 'motivo', 'link'],
     'A vaga “{{titulo}}” foi preenchida',
     'Oi, {{nome}}.

A vaga “{{titulo}}”, que você curtiu, foi preenchida. Obrigado pelo interesse!

Tem muita vaga perto de você no Publike. Com o currículo preenchido, você vê o quanto combina com cada uma.',
     'Ver vagas perto de mim')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- A página do anúncio sabe se a vaga foi preenchida e o prazo escolhido
drop function if exists public.obter_anuncio(uuid);
create function public.obter_anuncio(p_id uuid)
returns table (
  id uuid,
  autor_id uuid,
  tipo text,
  titulo text,
  descricao text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  horario text,
  vagas smallint,
  cidade text,
  bairro text,
  lat double precision,
  lng double precision,
  status text,
  criado_em timestamptz,
  atualizado_em timestamptz,
  expira_em timestamptz,
  autor_nome text,
  autor_tipo text,
  autor_foto text,
  autor_verificado boolean,
  autor_desde timestamptz,
  minha_curtida text,
  minha_mensagem text,
  oficio text,
  fotos text[],
  atende text[],
  pede_curriculo boolean,
  contratante text,
  contratante_confidencial boolean,
  autor_cnpj text,
  cep text,
  endereco text,
  local_exato boolean,
  pagamento_ate numeric,
  comissao boolean,
  beneficios_lista text[],
  escolaridade_minima text,
  experiencia text,
  cnh text,
  jornada text,
  modelo text,
  pcd text,
  perguntas jsonb,
  beneficios_extras text[],
  horario_detalhe jsonb,
  minhas_respostas jsonb,
  contato_direto boolean,
  preenchida_em timestamptz,
  prazo_dias smallint
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select a.id, a.autor_id, a.tipo, a.titulo, a.descricao, a.categoria, a.regime,
         a.pagamento_valor, a.pagamento_unidade, a.beneficios, a.horario, a.vagas,
         a.cidade, a.bairro,
         round(st_y(a.local::geometry)::numeric, 5)::double precision,
         round(st_x(a.local::geometry)::numeric, 5)::double precision,
         a.status, a.criado_em, a.atualizado_em, a.expira_em,
         p.nome, p.tipo, p.foto, p.verificado, p.criado_em,
         c.status, c.mensagem,
         a.oficio, a.fotos, a.atende, a.pede_curriculo,
         a.contratante, a.contratante_confidencial, p.cnpj,
         a.cep, a.endereco, a.local_exato,
         a.pagamento_ate, a.comissao, a.beneficios_lista, a.escolaridade_minima, a.experiencia, a.cnh,
         a.jornada, a.modelo, a.pcd,
         a.perguntas, a.beneficios_extras, a.horario_detalhe, c.respostas, a.contato_direto,
         a.preenchida_em, a.prazo_dias
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
   where a.id = p_id
$$;

grant execute on function public.obter_anuncio(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
