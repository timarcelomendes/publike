-- =====================================================================
-- Busca de vagas: "Me avise de vagas assim" e quanto quem publica responde
--
--   1. buscas_salvas: quem procura salva a busca (palavra, área, contratação,
--      turno, ponto e distância) e recebe um aviso quando entra no ar uma vaga
--      nova que bate. No máximo 10 buscas por pessoa e 5 avisos por dia.
--   2. resposta_de_quem_publica(ids): a parte das curtidas que cada um responde
--      e em quanto tempo (mediana), só com 5 curtidas ou mais. Nunca devolve
--      quantas curtidas a pessoa recebeu.
--
-- Rode ANTES de publicar o código novo (o código antigo continua funcionando
-- com o banco novo). Rode depois de 20261016180000_aceite_com_curriculo.sql.
-- Pode rodar de novo.
-- =====================================================================

-- 0. Aviso novo -------------------------------------------------------------------------

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca'));


-- 1. Buscas salvas ----------------------------------------------------------------------

create table if not exists public.buscas_salvas (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  texto text check (texto is null or char_length(texto) between 1 and 80),
  categoria text check (categoria is null or char_length(categoria) <= 40),
  regime text check (regime is null or char_length(regime) <= 40),
  turno text check (turno is null or turno in ('manha', 'tarde', 'noite', 'fim_de_semana')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  raio_km numeric not null check (raio_km between 1 and 100),
  -- "“caixa” · CLT · à tarde · até 10 km da sua casa"
  rotulo text not null check (char_length(rotulo) between 1 and 160),
  -- o endereço da busca no site, para abrir de novo
  caminho text not null check (caminho like '/%' and char_length(caminho) <= 500),
  criado_em timestamptz not null default now()
);
create index if not exists buscas_salvas_perfil_idx on public.buscas_salvas (perfil_id);

alter table public.buscas_salvas enable row level security;
drop policy if exists "ver as minhas buscas" on public.buscas_salvas;
create policy "ver as minhas buscas" on public.buscas_salvas for select to authenticated
  using (perfil_id = (select auth.uid()));
drop policy if exists "apagar as minhas buscas" on public.buscas_salvas;
create policy "apagar as minhas buscas" on public.buscas_salvas for delete to authenticated
  using (perfil_id = (select auth.uid()));
revoke all on public.buscas_salvas from anon, authenticated;
grant select, delete on public.buscas_salvas to authenticated;

-- Salvar (a mesma busca de novo devolve a que já existe)
create or replace function public.salvar_busca(
  p_texto text, p_categoria text, p_regime text, p_turno text,
  p_lat double precision, p_lng double precision, p_raio_km numeric, p_rotulo text, p_caminho text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
  v_id bigint;
begin
  perform privado.exigir_conta_ativa();
  if usuario is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  select b.id into v_id
    from public.buscas_salvas b
   where b.perfil_id = usuario
     and b.texto is not distinct from v_texto
     and b.categoria is not distinct from p_categoria
     and b.regime is not distinct from p_regime
     and b.turno is not distinct from p_turno
     and abs(b.lat - p_lat) < 0.0005 and abs(b.lng - p_lng) < 0.0005
     and b.raio_km = p_raio_km
   limit 1;
  if v_id is not null then
    return v_id;
  end if;
  if (select count(*) from public.buscas_salvas b where b.perfil_id = usuario) >= 10 then
    raise exception 'Você já tem 10 buscas com aviso. Apague uma em Painel › Seguindo para salvar outra.'
      using errcode = 'P0001';
  end if;
  insert into public.buscas_salvas (perfil_id, texto, categoria, regime, turno, lat, lng, raio_km, rotulo, caminho)
  values (usuario, v_texto, p_categoria, p_regime, p_turno, p_lat, p_lng, p_raio_km,
          left(btrim(p_rotulo), 160), p_caminho)
  returning id into v_id;
  return v_id;
end
$$;
revoke execute on function public.salvar_busca(text, text, text, text, double precision, double precision, numeric, text, text)
  from public, anon;
grant execute on function public.salvar_busca(text, text, text, text, double precision, double precision, numeric, text, text)
  to authenticated;

-- A vaga é no turno? A mesma regra da busca do site (src/lib/aderencia.ts, vagaNoTurno):
-- vale o horário montado (turnos, dias e escala) e a jornada; sem isso, o texto da vaga.
create or replace function privado.vaga_no_turno(a public.anuncios, p_turno text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  h jsonb := a.horario_detalhe;
  t jsonb;
  ini int;
  fim int;
  periodos text[] := '{}';
  texto text;
begin
  if p_turno is null then
    return true;
  end if;
  if h is not null and jsonb_typeof(h) = 'object' then
    for t in select * from jsonb_array_elements(case when jsonb_typeof(h -> 'turnos') = 'array' then h -> 'turnos' else '[]'::jsonb end) loop
      begin
        ini := split_part(t ->> 'inicio', ':', 1)::int * 60 + split_part(t ->> 'inicio', ':', 2)::int;
        fim := split_part(t ->> 'fim', ':', 1)::int * 60 + split_part(t ->> 'fim', ':', 2)::int;
      exception when others then
        continue;
      end;
      if fim <= ini then
        fim := fim + 1440; -- passa da meia-noite
      end if;
      -- conta o período em que o turno fica pelo menos 1 hora (manhã 6–12h, tarde 12–18h, noite 18–6h)
      if greatest(0, least(fim, 720) - greatest(ini, 360)) + greatest(0, least(fim, 2160) - greatest(ini, 1800)) >= 60 then
        periodos := array_append(periodos, 'manha');
      end if;
      if greatest(0, least(fim, 1080) - greatest(ini, 720)) >= 60 then
        periodos := array_append(periodos, 'tarde');
      end if;
      if greatest(0, least(fim, 360) - greatest(ini, 0)) + greatest(0, least(fim, 1800) - greatest(ini, 1080)) >= 60 then
        periodos := array_append(periodos, 'noite');
      end if;
    end loop;
    if (h -> 'dias') ? 'sab' or (h -> 'dias') ? 'dom' or h ->> 'escala' = '6x1' then
      periodos := array_append(periodos, 'fim_de_semana');
    end if;
    if h ->> 'escala' is not null and h ->> 'escala' not in ('5x2', '6x1') then
      periodos := array_append(periodos, 'escala');
    end if;
  end if;
  if a.jornada = 'escala_6x1' or a.jornada = 'fim_de_semana' then
    periodos := array_append(periodos, 'fim_de_semana');
  end if;
  if a.jornada = 'escala_12x36' then
    periodos := array_append(periodos, 'escala');
  end if;
  if a.jornada = 'noturno' then
    periodos := array_append(periodos, 'noite');
  end if;
  if a.jornada = 'integral' and not (h is not null and jsonb_typeof(h -> 'turnos') = 'array' and jsonb_array_length(h -> 'turnos') > 0) then
    periodos := periodos || array['manha', 'tarde'];
  end if;
  if cardinality(periodos) > 0 then
    return p_turno = any (periodos);
  end if;
  texto := lower(public.sem_acento(coalesce(a.titulo, '') || ' ' || coalesce(a.horario, '') || ' ' || coalesce(a.descricao, '')));
  return case p_turno
    when 'manha' then texto ~ '(manha|matutin|\m(5|6|7|8)h)'
    when 'tarde' then texto ~ '(tarde|vespertin|\m(13|14)h)'
    when 'noite' then texto ~ '(noite|noturn|madrugada|\m(18|19|20|22)h)'
    when 'fim_de_semana' then texto ~ '(fim de semana|fins de semana|sabado|domingo)'
    else false
  end;
end
$$;
revoke execute on function privado.vaga_no_turno(public.anuncios, text) from public;

-- Vaga entrou no ar pela primeira vez: avisa quem tem uma busca que bate
create table if not exists privado.avisos_busca (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  criado_em timestamptz not null default now()
);
-- as vagas que já estavam no ar antes disto não avisam ninguém
insert into privado.avisos_busca (anuncio_id)
select a.id from public.anuncios a where a.status <> 'em_analise'
on conflict do nothing;

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

drop trigger if exists avisar_buscas on public.anuncios;
create trigger avisar_buscas
  after insert or update of status on public.anuncios
  for each row execute function privado.avisar_buscas();
revoke execute on function privado.avisar_buscas() from public;


-- 2. Quanto quem publica responde -------------------------------------------------------
-- Curtidas dos últimos 180 dias nas vagas de cada um. Resposta: aceitou, dispensou
-- ou aceitou esperando o currículo. As de menos de 3 dias ainda sem resposta não
-- contam contra (ainda dá tempo). Só com 5 curtidas ou mais; a taxa vem arredondada.

create or replace function public.resposta_de_quem_publica(p_autores uuid[])
returns table (autor_id uuid, taxa numeric, horas numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select a.autor_id,
           (cu.status <> 'pendente' or cu.aceita_em is not null) as respondida,
           extract(epoch from (coalesce(cu.aceita_em, cu.respondida_em) - cu.criado_em)) / 3600 as horas
      from public.curtidas cu
      join public.anuncios a on a.id = cu.anuncio_id
     where a.autor_id = any (p_autores[1:100])
       and a.tipo = 'vaga'
       and cu.criado_em > now() - interval '180 days'
       and (cu.status <> 'pendente' or cu.aceita_em is not null or cu.criado_em < now() - interval '3 days')
  )
  select c.autor_id,
         round(count(*) filter (where c.respondida)::numeric / count(*), 1) as taxa,
         round((percentile_cont(0.5) within group (order by c.horas)
                  filter (where c.respondida and c.horas is not null and c.horas >= 0))::numeric, 0) as horas
    from c
   group by c.autor_id
  having count(*) >= 5
$$;
revoke execute on function public.resposta_de_quem_publica(uuid[]) from public;
grant execute on function public.resposta_de_quem_publica(uuid[]) to anon, authenticated;


-- 3. E-mail do aviso novo ---------------------------------------------------------------
-- (as mesmas funções de 20261015170000_boas_vindas.sql e de
-- 20261016180000_aceite_com_curriculo.sql, com o aviso "busca")

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
  -- avisos que podem se repetir: no máximo um do mesmo tipo a cada 30 minutos para a mesma pessoa
  if p_modelo in ('curtida', 'etapa', 'contratacao', 'recomendacao', 'seguindo', 'mensagem', 'busca') and exists (
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
  if new.tipo in ('etapa', 'seguindo', 'recomendacao', 'contratacao', 'entrevista', 'entrevista_resposta', 'busca') then
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
    ('busca', 'usuarios', 21, 'Vaga nova de uma busca com aviso',
     'Quando entra no ar uma vaga que bate com uma busca que a pessoa pediu para avisar ("Me avise de vagas assim"). No máximo 5 por dia.',
     array['nome', 'titulo', 'motivo', 'link'],
     'Vaga nova: “{{titulo}}”',
     'Oi, {{nome}}.

{{motivo}}

Veja os detalhes e, se tiver interesse, curta a vaga. Para parar de receber, apague a busca no seu painel, em Seguindo.',
     'Ver a vaga')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;
