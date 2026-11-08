-- Os documentos da admissão (08/11/2026; claude/plano-painel-feed-indicacao-documentos.md, parte 4). Pode rodar de novo.
-- Muda a decisão 4 de 31/10 (o Marcelo aprovou em 08/11): o Publike guarda as fotos e os PDFs dos documentos por pouco
-- tempo, sem IA, para a empresa mandar ao contador.
--   * depois de aceitar a proposta, o candidato aceita o termo (a empresa é a controladora; o Publike, o operador) e,
--     em cada item da lista, manda a foto ou o PDF, ou marca "Vou levar no primeiro dia";
--   * a empresa vê "Documentos: 7 de 9", baixa tudo num .zip e marca "Entregue ao contador";
--   * os arquivos somem 7 dias depois da entrega ou 30 dias depois do primeiro dia (o que vier primeiro): a partir daí
--     ninguém abre, e a tarefa das filas apaga (servidor_documentos_vencidos); a pessoa apaga antes da entrega;
--   * a lista não aceita atestado de gravidez ou de esterilização (Lei 9.029/1995) nem antecedentes criminais;
--   * o lembrete: 2 dias antes do primeiro dia, se faltar documento (aviso novo `documentos_admissao`).
-- Rode depois de 20270311120000_indicacao.sql.

-- 1. A proposta guarda o termo, a entrega e o apagamento ---------------------------------------------------
alter table public.propostas add column if not exists documentos_aceite_em timestamptz;
alter table public.propostas add column if not exists documentos_entregues_em timestamptz;
alter table public.propostas add column if not exists documentos_apagados_em timestamptz;
alter table public.propostas add column if not exists documentos_lembrete_em timestamptz;

create table if not exists public.documentos_admissao (
  proposta_id uuid not null references public.propostas (id) on delete cascade,
  item text not null check (char_length(item) between 2 and 60),
  situacao text not null check (situacao in ('enviado', 'levar')),
  caminhos text[] not null default '{}' check (cardinality(caminhos) <= 4),
  atualizado_em timestamptz not null default now(),
  primary key (proposta_id, item)
);
alter table public.documentos_admissao enable row level security;
revoke all on public.documentos_admissao from public, anon, authenticated;

-- o que não se pede na admissão (Lei 9.029/1995; TST): vale para a lista da proposta
create or replace function privado.documento_proibido(p_item text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_item ~* '(gravidez|gestac|gestaç|gravida|grávida|beta.?hcg|esteriliza|laqueadura|vasectomia)'
      then 'Atestado de gravidez ou de esterilização não pode ser pedido (Lei 9.029/1995).'
    when p_item ~* '(antecedentes|criminal|criminais|nada consta)'
      then 'Certidão de antecedentes criminais só vale quando a lei ou a função justifica (TST). Fale com o seu contador.'
  end
$$;

create or replace function privado.conferir_documentos_da_proposta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  d text;
  v_motivo text;
begin
  foreach d in array coalesce(new.documentos, '{}') loop
    v_motivo := privado.documento_proibido(d);
    if v_motivo is not null then
      raise exception '%', v_motivo using errcode = '22023';
    end if;
  end loop;
  return new;
end
$$;
drop trigger if exists propostas_documentos_permitidos on public.propostas;
create trigger propostas_documentos_permitidos before insert or update of documentos on public.propostas
  for each row execute function privado.conferir_documentos_da_proposta();

-- os itens que não são arquivo (a carteira é a digital; o exame a empresa marca)
create or replace function privado.documento_se_envia(p_item text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_item !~* '^(exame admissional|carteira de trabalho)'
$$;

-- até quando os arquivos ficam: 7 dias depois da entrega ao contador ou 30 dias depois do primeiro dia
create or replace function privado.documentos_vencem_em(p public.propostas)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select least(coalesce(p.documentos_entregues_em + interval '7 days', 'infinity'::timestamptz),
               ((p.inicio + 31)::timestamp at time zone 'America/Sao_Paulo'))
$$;

-- 2. O lugar dos arquivos e quem abre ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-admissao', 'documentos-admissao', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- os arquivos vencidos que a tarefa das filas está apagando agora (por 15 minutos)
create table if not exists privado.documentos_para_apagar (
  caminho text primary key,
  ate timestamptz not null
);

create or replace function privado.doc_pode_enviar(p_proposta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_proposta ~ '^[0-9a-f-]{36}$' and exists (
    select 1 from public.propostas p
     where p.id = p_proposta::uuid and p.perfil_id = (select auth.uid()) and p.situacao = 'aceita'
       and p.documentos_aceite_em is not null and p.documentos_entregues_em is null
       and p.documentos_apagados_em is null and now() < privado.documentos_vencem_em(p))
$$;

create or replace function privado.doc_pode_ver(p_proposta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_proposta ~ '^[0-9a-f-]{36}$' and exists (
    select 1 from public.propostas p join public.anuncios a on a.id = p.anuncio_id
     where p.id = p_proposta::uuid and p.situacao = 'aceita' and p.documentos_apagados_em is null
       and now() < privado.documentos_vencem_em(p)
       and (p.perfil_id = (select auth.uid()) or a.autor_id = (select public.conta_atual())))
$$;

-- a pessoa apaga antes da entrega; o vencido, a tarefa das filas (com o caminho marcado agora)
create or replace function privado.doc_pode_apagar(p_proposta text, p_caminho text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.documentos_para_apagar x where x.caminho = p_caminho and x.ate > now())
      or (p_proposta ~ '^[0-9a-f-]{36}$' and exists (
            select 1 from public.propostas p
             where p.id = p_proposta::uuid and p.perfil_id = (select auth.uid())
               and p.documentos_entregues_em is null))
$$;

revoke execute on function privado.doc_pode_enviar(text), privado.doc_pode_ver(text), privado.doc_pode_apagar(text, text)
  from public;
grant execute on function privado.doc_pode_enviar(text), privado.doc_pode_ver(text) to authenticated;
grant execute on function privado.doc_pode_apagar(text, text) to anon, authenticated;
grant usage on schema privado to anon;

drop policy if exists "publike: documentos da admissão, enviar" on storage.objects;
drop policy if exists "publike: documentos da admissão, ver" on storage.objects;
drop policy if exists "publike: documentos da admissão, apagar" on storage.objects;
drop policy if exists "publike: documentos da admissão, vencidos" on storage.objects;
create policy "publike: documentos da admissão, enviar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos-admissao'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and privado.doc_pode_enviar((storage.foldername(name))[2]));
create policy "publike: documentos da admissão, ver" on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos-admissao' and privado.doc_pode_ver((storage.foldername(name))[2]));
-- só para apagar: o vencido marcado agora aparece (para a tarefa das filas, sem login) e pode ser apagado
create policy "publike: documentos da admissão, vencidos" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'documentos-admissao'
         and exists (select 1 from privado.documentos_para_apagar x where x.caminho = name and x.ate > now()));
create policy "publike: documentos da admissão, apagar" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'documentos-admissao' and privado.doc_pode_apagar((storage.foldername(name))[2], name));
grant select on privado.documentos_para_apagar to anon, authenticated;

-- 3. Para o candidato ----------------------------------------------------------------------------------
create or replace function privado.minha_proposta_aceita(p_anuncio uuid)
returns public.propostas
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.propostas;
begin
  select * into p from public.propostas x
   where x.anuncio_id = p_anuncio and x.perfil_id = (select auth.uid()) and x.situacao = 'aceita';
  if not found then
    raise exception 'Proposta não encontrada.' using errcode = 'P0002';
  end if;
  return p;
end
$$;

create or replace function privado.documentos_em_json(p public.propostas, p_com_caminhos boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'proposta_id', p.id, 'anuncio_id', p.anuncio_id, 'perfil_id', p.perfil_id, 'inicio', p.inicio,
    'aceite_em', p.documentos_aceite_em, 'entregues_em', p.documentos_entregues_em,
    'apagados_em', p.documentos_apagados_em, 'vence_em', privado.documentos_vencem_em(p),
    'vencido', p.documentos_apagados_em is not null or now() >= privado.documentos_vencem_em(p),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'item', i.item, 'se_envia', privado.documento_se_envia(i.item),
               'situacao', d.situacao, 'arquivos', coalesce(cardinality(d.caminhos), 0),
               'caminhos', case when p_com_caminhos and p.documentos_apagados_em is null
                                     and now() < privado.documentos_vencem_em(p)
                                then to_jsonb(coalesce(d.caminhos, '{}')) else '[]'::jsonb end)
             order by i.ordem)
        from unnest(p.documentos) with ordinality i(item, ordem)
        left join public.documentos_admissao d on d.proposta_id = p.id and d.item = i.item), '[]'::jsonb))
$$;

create or replace function public.meus_documentos_admissao(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.propostas;
begin
  select * into p from public.propostas x
   where x.anuncio_id = p_anuncio and x.perfil_id = (select auth.uid()) and x.situacao = 'aceita';
  if not found then
    return null;
  end if;
  return privado.documentos_em_json(p, true);
end
$$;

create or replace function public.aceitar_termo_documentos(p_anuncio uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.propostas := privado.minha_proposta_aceita(p_anuncio);
begin
  perform privado.exigir_conta_ativa();
  update public.propostas set documentos_aceite_em = coalesce(documentos_aceite_em, now()) where id = p.id;
end
$$;

-- o arquivo já está no lugar: guarda os caminhos do item; devolve os de antes (o site apaga)
create or replace function public.documento_registrar(p_anuncio uuid, p_item text, p_caminhos text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.propostas := privado.minha_proposta_aceita(p_anuncio);
  v_antes text[];
  c text;
begin
  perform privado.exigir_conta_ativa();
  if not privado.doc_pode_enviar(p.id::text) then
    raise exception 'Não dá mais para mandar documentos desta proposta.' using errcode = 'P0001';
  end if;
  if not (p_item = any (p.documentos)) or not privado.documento_se_envia(p_item) then
    raise exception 'Este item não está na lista da empresa.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_caminhos), 0) not between 1 and 4 then
    raise exception 'Mande de 1 a 4 arquivos por item.' using errcode = '22023';
  end if;
  foreach c in array p_caminhos loop
    if c not like (select auth.uid())::text || '/' || p.id::text || '/%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'documentos-admissao' and o.name = c) then
      raise exception 'O arquivo não chegou. Tente mandar de novo.' using errcode = 'P0001', hint = 'sem_arquivo';
    end if;
  end loop;
  select d.caminhos into v_antes from public.documentos_admissao d where d.proposta_id = p.id and d.item = p_item;
  insert into public.documentos_admissao (proposta_id, item, situacao, caminhos, atualizado_em)
  values (p.id, p_item, 'enviado', p_caminhos, now())
  on conflict (proposta_id, item) do update set situacao = 'enviado', caminhos = excluded.caminhos, atualizado_em = now();
  return array(select x from unnest(coalesce(v_antes, '{}')) x where not (x = any (p_caminhos)));
end
$$;

-- "Vou levar no primeiro dia" (ou desfazer): devolve os arquivos de antes (o site apaga)
create or replace function public.documento_vou_levar(p_anuncio uuid, p_item text, p_levar boolean)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.propostas := privado.minha_proposta_aceita(p_anuncio);
  v_antes text[];
begin
  perform privado.exigir_conta_ativa();
  if p.documentos_entregues_em is not null or p.documentos_apagados_em is not null then
    raise exception 'A empresa já entregou os documentos ao contador.' using errcode = 'P0001';
  end if;
  if not (p_item = any (p.documentos)) then
    raise exception 'Este item não está na lista da empresa.' using errcode = '22023';
  end if;
  delete from public.documentos_admissao d where d.proposta_id = p.id and d.item = p_item
  returning d.caminhos into v_antes;
  if p_levar then
    insert into public.documentos_admissao (proposta_id, item, situacao) values (p.id, p_item, 'levar');
  end if;
  return coalesce(v_antes, '{}');
end
$$;

-- a pessoa apaga tudo antes da entrega: devolve os caminhos (o site apaga os arquivos)
create or replace function public.documentos_apagar_meus(p_anuncio uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.propostas := privado.minha_proposta_aceita(p_anuncio);
  v_caminhos text[];
begin
  if p.documentos_entregues_em is not null then
    raise exception 'A empresa já entregou os documentos ao contador. Eles somem sozinhos em até 7 dias.'
      using errcode = 'P0001';
  end if;
  select coalesce(array_agg(c), '{}') into v_caminhos
    from public.documentos_admissao d, unnest(d.caminhos) c where d.proposta_id = p.id;
  delete from public.documentos_admissao d where d.proposta_id = p.id and d.situacao = 'enviado';
  return v_caminhos;
end
$$;

-- 4. Para a empresa ------------------------------------------------------------------------------------
-- o resumo de cada contratado com proposta aceita numa vaga da conta (a ficha e o quadro)
create or replace function public.documentos_da_vaga(p_anuncio uuid)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = (select public.conta_atual())) then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  return query
    select privado.documentos_em_json(p, false) from public.propostas p
     where p.anuncio_id = p_anuncio and p.situacao = 'aceita' and cardinality(p.documentos) > 0;
end
$$;

-- os caminhos de um contratado, para baixar (o site assina os links por minutos)
create or replace function public.documentos_do_contratado(p_anuncio uuid, p_perfil uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.propostas;
begin
  select x.* into p from public.propostas x join public.anuncios a on a.id = x.anuncio_id
   where x.anuncio_id = p_anuncio and x.perfil_id = p_perfil and x.situacao = 'aceita'
     and a.autor_id = (select public.conta_atual());
  if not found then
    raise exception 'Proposta não encontrada.' using errcode = 'P0002';
  end if;
  return privado.documentos_em_json(p, true)
         || jsonb_build_object('nome', (select x.nome from public.perfis x where x.id = p_perfil));
end
$$;

create or replace function public.documentos_entregues(p_anuncio uuid, p_perfil uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quando timestamptz;
begin
  perform privado.exigir_conta_ativa();
  update public.propostas x set documentos_entregues_em = coalesce(x.documentos_entregues_em, now())
    from public.anuncios a
   where a.id = x.anuncio_id and x.anuncio_id = p_anuncio and x.perfil_id = p_perfil and x.situacao = 'aceita'
     and a.autor_id = (select public.conta_atual())
  returning x.documentos_entregues_em into v_quando;
  if v_quando is null then
    raise exception 'Proposta não encontrada.' using errcode = 'P0002';
  end if;
  return v_quando;
end
$$;

-- para o Agora e Esta semana: os contratados da conta com documentos ainda não entregues (início de 7 dias atrás em diante)
create or replace function public.documentos_pendentes_da_conta()
returns table (anuncio_id uuid, perfil_id uuid, nome text, vaga text, inicio date, total integer, enviados integer,
               levar integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.anuncio_id, p.perfil_id, split_part(pe.nome, ' ', 1), a.titulo, p.inicio,
         (select count(*)::integer from unnest(p.documentos) i where privado.documento_se_envia(i)),
         (select count(*)::integer from public.documentos_admissao d
           where d.proposta_id = p.id and d.situacao = 'enviado'),
         (select count(*)::integer from public.documentos_admissao d
           where d.proposta_id = p.id and d.situacao = 'levar')
    from public.propostas p
    join public.anuncios a on a.id = p.anuncio_id
    join public.perfis pe on pe.id = p.perfil_id
   where a.autor_id = (select public.conta_atual()) and p.situacao = 'aceita'
     and p.documentos_entregues_em is null and p.documentos_apagados_em is null
     and cardinality(p.documentos) > 0
     and p.inicio >= (now() at time zone 'America/Sao_Paulo')::date - 7
   order by p.inicio
   limit 30
$$;

-- 5. A tarefa das filas: o lembrete e o apagamento ------------------------------------------------------
-- 2 dias antes do primeiro dia (das 8h às 20h), se faltar documento: um aviso só por proposta
create or replace function public.servidor_lembrete_documentos(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  n integer := 0;
  r record;
begin
  perform privado.exigir_servidor(p_chave);
  if v_hora < 8 or v_hora >= 20 then
    return 0;
  end if;
  for r in
    select p.id, p.perfil_id, p.anuncio_id, a.autor_id, a.titulo, p.inicio,
           (select count(*) from unnest(p.documentos) i
             where privado.documento_se_envia(i)
               and not exists (select 1 from public.documentos_admissao d where d.proposta_id = p.id and d.item = i))
             as faltam
      from public.propostas p join public.anuncios a on a.id = p.anuncio_id
     where p.situacao = 'aceita' and p.documentos_lembrete_em is null and p.documentos_entregues_em is null
       and p.inicio between v_hoje and v_hoje + 2 and cardinality(p.documentos) > 0
     limit 200
  loop
    update public.propostas set documentos_lembrete_em = now() where id = r.id;
    if r.faltam > 0 then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
      values (r.perfil_id, 'documentos_admissao', r.anuncio_id, r.autor_id,
              left('Você começa em ' || to_char(r.inicio, 'DD/MM') || ' na vaga “' || r.titulo || '”. '
                   || case when r.faltam = 1 then 'Falta 1 documento' else 'Faltam ' || r.faltam || ' documentos' end
                   || ': mande a foto pelo Publike ou marque que vai levar no primeiro dia.', 300),
              '/proposta/' || r.anuncio_id || '#documentos');
      n := n + 1;
    end if;
  end loop;
  return n;
end
$$;

-- os arquivos vencidos: marca por 15 minutos (o site apaga pelo Storage, sem login) e devolve os caminhos
create or replace function public.servidor_documentos_vencidos(p_chave text, p_limite integer default 200)
returns table (proposta_id uuid, caminho text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  delete from privado.documentos_para_apagar where ate < now();
  return query
    with v as (
      select p.id, c
        from public.propostas p
        join public.documentos_admissao d on d.proposta_id = p.id
        cross join unnest(d.caminhos) c
       where p.documentos_apagados_em is null and now() >= privado.documentos_vencem_em(p)
       limit greatest(1, least(coalesce(p_limite, 200), 1000))
    ), marca as (
      insert into privado.documentos_para_apagar (caminho, ate)
      select v.c, now() + interval '15 minutes' from v
      on conflict on constraint documentos_para_apagar_pkey do update set ate = excluded.ate
    )
    select v.id, v.c from v;
end
$$;

-- os arquivos já saíram do Storage: limpa as linhas e marca a proposta (também a vencida sem arquivo)
create or replace function public.servidor_documentos_apagados(p_chave text, p_propostas uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform privado.exigir_servidor(p_chave);
  delete from privado.documentos_para_apagar x
   using public.documentos_admissao d, public.propostas p
   where p.id = any (coalesce(p_propostas, '{}')) and d.proposta_id = p.id and x.caminho = any (d.caminhos);
  update public.documentos_admissao d set caminhos = '{}'
    from public.propostas p
   where p.id = d.proposta_id and p.id = any (coalesce(p_propostas, '{}'))
     and now() >= privado.documentos_vencem_em(p);
  update public.propostas p set documentos_apagados_em = now()
   where p.documentos_apagados_em is null and p.situacao = 'aceita' and now() >= privado.documentos_vencem_em(p)
     and (p.id = any (coalesce(p_propostas, '{}'))
          or not exists (select 1 from public.documentos_admissao d
                          where d.proposta_id = p.id and cardinality(d.caminhos) > 0));
  get diagnostics n = row_count;
  return n;
end
$$;

revoke execute on function public.meus_documentos_admissao(uuid), public.aceitar_termo_documentos(uuid),
  public.documento_registrar(uuid, text, text[]), public.documento_vou_levar(uuid, text, boolean),
  public.documentos_apagar_meus(uuid), public.documentos_da_vaga(uuid), public.documentos_do_contratado(uuid, uuid),
  public.documentos_entregues(uuid, uuid), public.documentos_pendentes_da_conta()
  from public, anon;
grant execute on function public.meus_documentos_admissao(uuid), public.aceitar_termo_documentos(uuid),
  public.documento_registrar(uuid, text, text[]), public.documento_vou_levar(uuid, text, boolean),
  public.documentos_apagar_meus(uuid), public.documentos_da_vaga(uuid), public.documentos_do_contratado(uuid, uuid),
  public.documentos_entregues(uuid, uuid), public.documentos_pendentes_da_conta()
  to authenticated;
revoke execute on function public.servidor_lembrete_documentos(text),
  public.servidor_documentos_vencidos(text, integer), public.servidor_documentos_apagados(text, uuid[]) from public;
grant execute on function public.servidor_lembrete_documentos(text),
  public.servidor_documentos_vencidos(text, integer), public.servidor_documentos_apagados(text, uuid[])
  to anon, authenticated, service_role;
revoke execute on function privado.minha_proposta_aceita(uuid), privado.documentos_em_json(public.propostas, boolean)
  from public, anon;


-- O aviso novo: documentos_admissao (as definições de agora, com o tipo novo) ------------------------------------------------------

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check CHECK ((tipo = ANY (ARRAY['curtida'::text, 'match'::text, 'em_analise'::text, 'removido'::text, 'liberado'::text, 'avaliacao'::text, 'avaliacao_retida'::text, 'match_desfeito'::text, 'etapa'::text, 'mensagem'::text, 'seguindo'::text, 'recomendacao'::text, 'contratacao'::text, 'entrevista'::text, 'entrevista_resposta'::text, 'aceite_curriculo'::text, 'curriculo_recebido'::text, 'busca'::text, 'convite'::text, 'vaga_preenchida'::text, 'finalistas'::text, 'convite_candidato'::text, 'equipe'::text, 'conexao'::text, 'recado_no_ar'::text, 'recado_retido'::text, 'recado_forca'::text, 'convite_curriculo'::text, 'convite_empresa'::text, 'convite_agencia'::text, 'convite_servicos'::text, 'convite_vitrine'::text, 'curriculo_publico'::text, 'visita'::text, 'visitas_do_dia'::text, 'visitas_novidade'::text, 'avaliacao_liberada'::text, 'avaliacao_removida'::text, 'mensagem_equipe'::text, 'vagas_semana'::text, 'talentos_semana'::text, 'comunicado'::text, 'noticias_do_dia'::text, 'teste_pedido'::text, 'teste_feito'::text, 'lembrete_curtida'::text, 'sem_resposta'::text, 'pagamento'::text, 'dispensada'::text, 'entrevista_lembrete'::text, 'video_pedido'::text, 'video_enviado'::text, 'parados'::text, 'proposta'::text, 'proposta_resposta'::text, 'candidatura_recebida'::text, 'talentos_reativar'::text, 'match_empresa'::text, 'matches_sem_contato'::text, 'respostas_match'::text, 'liberacao'::text, 'talento_combina'::text, 'pedido_cliente'::text, 'busca_talentos'::text, 'documentos_admissao'::text])));

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
                    'match_empresa', 'matches_sem_contato', 'respostas_match', 'talento_combina', 'pedido_cliente', 'busca_talentos', 'documentos_admissao') then 'andamento'
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
                  'match_empresa', 'matches_sem_contato', 'respostas_match', 'liberacao', 'talento_combina', 'pedido_cliente', 'busca_talentos', 'documentos_admissao') then
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
                 when 'documentos_admissao' then coalesce(new.link, '/painel/curtidas')
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
CREATE TRIGGER notificacoes_para_celular AFTER INSERT ON public.notificacoes FOR EACH ROW WHEN ((new.tipo = ANY (ARRAY['curtida'::text, 'match'::text, 'mensagem'::text, 'conexao'::text, 'em_analise'::text, 'removido'::text, 'liberado'::text, 'etapa'::text, 'entrevista'::text, 'entrevista_resposta'::text, 'contratacao'::text, 'aceite_curriculo'::text, 'curriculo_recebido'::text, 'convite'::text, 'convite_candidato'::text, 'finalistas'::text, 'vaga_preenchida'::text, 'seguindo'::text, 'busca'::text, 'avaliacao'::text, 'recado_retido'::text, 'mensagem_equipe'::text, 'equipe'::text, 'vagas_semana'::text, 'talentos_semana'::text, 'noticias_do_dia'::text, 'teste_pedido'::text, 'teste_feito'::text, 'lembrete_curtida'::text, 'sem_resposta'::text, 'pagamento'::text, 'dispensada'::text, 'entrevista_lembrete'::text, 'video_pedido'::text, 'video_enviado'::text, 'parados'::text, 'proposta'::text, 'proposta_resposta'::text, 'candidatura_recebida'::text, 'talentos_reativar'::text, 'match_empresa'::text, 'matches_sem_contato'::text, 'respostas_match'::text, 'liberacao'::text, 'talento_combina'::text, 'pedido_cliente'::text, 'busca_talentos'::text, 'documentos_admissao'::text]))) EXECUTE FUNCTION privado.notificacao_para_celular();

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('documentos_admissao', 'usuarios', 46, 'Documentos da admissão',
     'Para quem foi contratado: 2 dias antes do primeiro dia, se faltar documento.',
     array['nome', 'motivo', 'link'],
     'Faltam documentos para o seu primeiro dia',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Mandar os documentos')
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
