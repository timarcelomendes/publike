-- Triagem com IA, item 1 (claude/plano-triagem-automatica.md, 30/10/2026): ler sozinha, sem configurar. Só para as
-- contas com o recurso liberado (15 dias grátis, assinatura ou admin); o preço não muda.
--   a) A vaga sem critérios ganha os que a IA monta pela própria vaga (`automaticos`). Nunca troca o que a pessoa
--      salvou: salvar pela tela deixa `automaticos` falso.
--   b) Cada candidato com currículo é lido quando chega (a tarefa das filas e o curtir chamam), com o mesmo limite
--      de 300 leituras por conta em 24 h. A IA nunca recebe nome, foto nem contato (o site monta o texto).
-- As funções servidor_* pedem a chave do servidor (privado.exigir_servidor). Pode rodar de novo.

alter table privado.copiloto_vagas add column if not exists automaticos boolean not null default false;

-- a conferência dos critérios, a mesma da tela e da IA
create or replace function privado.copiloto_conferir_criterios(p_criterios jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  ids text[] := '{}';
begin
  if jsonb_typeof(p_criterios) <> 'array' or jsonb_array_length(p_criterios) > 8 then
    raise exception 'Ponha até 8 critérios.' using errcode = 'P0001';
  end if;
  for item in select * from jsonb_array_elements(p_criterios) loop
    if jsonb_typeof(item) <> 'object' or coalesce(item ->> 'id', '') !~ '^[a-z0-9]{1,12}$'
       or char_length(coalesce(item ->> 'texto', '')) not between 3 and 120
       or jsonb_typeof(item -> 'obrigatorio') is distinct from 'boolean' then
      raise exception 'Confira os critérios.' using errcode = 'P0001';
    end if;
    if (item ->> 'id') = any (ids) then
      raise exception 'Confira os critérios.' using errcode = 'P0001';
    end if;
    if privado.copiloto_criterio_proibido(item ->> 'texto') then
      raise exception 'O critério “%” não pode: a lei não deixa escolher por isso.', item ->> 'texto'
        using errcode = 'P0001', hint = 'criterio_proibido';
    end if;
    ids := ids || (item ->> 'id');
  end loop;
end
$$;

-- salvar pela tela: os critérios passam a ser da pessoa
create or replace function public.copiloto_salvar_criterios(p_anuncio uuid, p_criterios jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_versao text;
  c privado.copiloto_contas;
  obrigatorios integer;
begin
  perform privado.copiloto_minha_vaga(p_anuncio);
  perform privado.copiloto_conferir_criterios(p_criterios);
  v_versao := md5(p_criterios::text);
  select * into c from privado.copiloto_contas x where x.conta_id = public.conta_atual();
  insert into privado.copiloto_vagas (anuncio_id, criterios, versao, triagem, busca, atualizado_em, automaticos)
  values (p_anuncio, p_criterios, v_versao, c.triagem, c.busca, now(), false)
  on conflict (anuncio_id) do update
    set criterios = excluded.criterios, versao = excluded.versao, atualizado_em = now(), automaticos = false;
  select count(*) into obrigatorios from jsonb_array_elements(p_criterios) e where (e ->> 'obrigatorio')::boolean;
  insert into privado.copiloto_registro (anuncio_id, conta_id, pessoa_id, acao, quantos, detalhe)
  values (p_anuncio, public.conta_atual(), (select auth.uid()), 'criterios', jsonb_array_length(p_criterios),
          obrigatorios::text);
  return v_versao;
end
$$;

-- a tela diz quando os critérios foram montados pela IA
create or replace function public.copiloto_da_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c privado.copiloto_contas;
  v privado.copiloto_vagas;
begin
  if not exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.tipo = 'vaga' and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = 'P0001';
  end if;
  select * into c from privado.copiloto_contas x
   where x.conta_id = public.conta_atual() and (x.ate is null or x.ate > now());
  if not found then
    return jsonb_build_object('liberado', false);
  end if;
  select * into v from privado.copiloto_vagas x where x.anuncio_id = p_anuncio;
  return jsonb_build_object(
    'liberado', true,
    'criterios', coalesce(v.criterios, '[]'::jsonb),
    'versao', coalesce(v.versao, ''),
    'triagem', coalesce(v.triagem, c.triagem),
    'busca', coalesce(v.busca, c.busca),
    'atualizado_em', v.atualizado_em,
    'padrao_triagem', c.triagem,
    'padrao_busca', c.busca,
    'automaticos', coalesce(v.automaticos, false));
end
$$;

-- a) as vagas que ainda não têm critérios
create or replace function public.servidor_copiloto_vagas_sem_criterios(p_chave text, p_limite integer default 5)
returns table (anuncio_id uuid, conta_id uuid, vaga jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
    select a.id, a.autor_id,
           jsonb_build_object(
             'tipo', a.tipo, 'titulo', a.titulo, 'descricao', a.descricao, 'categoria', a.categoria,
             'regime', a.regime, 'pagamento_valor', a.pagamento_valor, 'pagamento_unidade', a.pagamento_unidade,
             'beneficios', a.beneficios, 'horario', a.horario, 'vagas', a.vagas, 'cidade', a.cidade,
             'bairro', a.bairro, 'ganhos_extras', a.ganhos_extras, 'escolaridade_minima', a.escolaridade_minima,
             'experiencia', a.experiencia, 'cnh', a.cnh, 'jornada', a.jornada, 'perguntas', a.perguntas)
      from public.anuncios a
      join privado.copiloto_contas c on c.conta_id = a.autor_id and (c.ate is null or c.ate > now())
      left join privado.copiloto_vagas v on v.anuncio_id = a.id
     where a.tipo = 'vaga' and a.status = 'ativo' and a.criado_em > now() - interval '60 days'
       and coalesce(v.triagem, c.triagem, true)
       and coalesce(jsonb_array_length(v.criterios), 0) = 0
     order by a.criado_em desc
     limit least(greatest(coalesce(p_limite, 5), 1), 20);
end
$$;

-- a) grava os critérios da IA, só se a vaga ainda não tem nenhum
create or replace function public.servidor_copiloto_criterios_automaticos(p_chave text, p_anuncio uuid, p_criterios jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid;
  c privado.copiloto_contas;
  v_versao text;
  obrigatorios integer;
begin
  perform privado.exigir_servidor(p_chave);
  select a.autor_id into conta from public.anuncios a where a.id = p_anuncio and a.tipo = 'vaga';
  if conta is null or not privado.copiloto_liberado(conta) then
    return null;
  end if;
  if jsonb_typeof(p_criterios) <> 'array' or jsonb_array_length(p_criterios) = 0 then
    return null;
  end if;
  perform privado.copiloto_conferir_criterios(p_criterios);
  select * into c from privado.copiloto_contas x where x.conta_id = conta;
  v_versao := md5(p_criterios::text);
  insert into privado.copiloto_vagas (anuncio_id, criterios, versao, triagem, busca, atualizado_em, automaticos)
  values (p_anuncio, p_criterios, v_versao, c.triagem, c.busca, now(), true)
  on conflict (anuncio_id) do update
    set criterios = excluded.criterios, versao = excluded.versao, atualizado_em = now(), automaticos = true
    where jsonb_array_length(privado.copiloto_vagas.criterios) = 0;
  if not found then
    return null;
  end if;
  select count(*) into obrigatorios from jsonb_array_elements(p_criterios) e where (e ->> 'obrigatorio')::boolean;
  insert into privado.copiloto_registro (anuncio_id, conta_id, pessoa_id, acao, quantos, detalhe)
  values (p_anuncio, conta, null, 'criterios', jsonb_array_length(p_criterios), 'automatico:' || obrigatorios);
  return v_versao;
end
$$;

-- b) quem se candidatou e ainda não foi lido com os critérios e o currículo de agora
create or replace function public.servidor_copiloto_fila(p_chave text, p_limite integer default 12)
returns table (
  anuncio_id uuid, conta_id uuid, perfil_id uuid, versao text, criterios jsonb, vaga_titulo text,
  vaga_descricao text, perguntas jsonb, curriculo jsonb, curriculo_em timestamptz, nome text, bairro text,
  cidade text, respostas jsonb, mensagem text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
    select a.id, a.autor_id, k.perfil_id, v.versao, v.criterios, a.titulo, a.descricao, a.perguntas,
           to_jsonb(cv) - 'arquivo', cv.atualizado_em, p.nome, p.bairro, p.cidade, k.respostas, k.mensagem
      from public.curtidas k
      join public.anuncios a on a.id = k.anuncio_id and a.tipo = 'vaga' and a.status = 'ativo'
      join privado.copiloto_contas c on c.conta_id = a.autor_id and (c.ate is null or c.ate > now())
      join privado.copiloto_vagas v on v.anuncio_id = a.id and jsonb_array_length(v.criterios) > 0
      join public.curriculos cv on cv.perfil_id = k.perfil_id
      join public.perfis p on p.id = k.perfil_id
      left join privado.copiloto_avaliacoes l on l.anuncio_id = a.id and l.perfil_id = k.perfil_id
     where coalesce(v.triagem, c.triagem, true)
       and k.status <> 'dispensada'
       and (l.perfil_id is null or l.versao <> v.versao or l.curriculo_em <> cv.atualizado_em)
       and (select count(*) from privado.limites_uso u
             where u.perfil_id = a.autor_id and u.acao = 'copiloto' and u.criado_em > now() - interval '24 hours') < 300
     order by k.criado_em
     limit least(greatest(coalesce(p_limite, 12), 1), 30);
end
$$;

-- b) guarda a leitura (como copiloto_guardar, para quem se candidatou), conta no limite e no registro
create or replace function public.servidor_copiloto_guardar(
  p_chave text, p_anuncio uuid, p_perfil uuid, p_versao text, p_curriculo_em timestamptz, p_resultado jsonb,
  p_atende integer, p_obrigatorios_ok boolean, p_modelo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid;
  ultimo privado.copiloto_registro;
begin
  perform privado.exigir_servidor(p_chave);
  select a.autor_id into conta from public.anuncios a where a.id = p_anuncio and a.tipo = 'vaga';
  if conta is null or not privado.copiloto_liberado(conta)
     or not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p_perfil)
     or jsonb_typeof(p_resultado) <> 'object' then
    return false;
  end if;
  insert into privado.copiloto_avaliacoes
    (anuncio_id, perfil_id, origem, versao, curriculo_em, resultado, atende, obrigatorios_ok, modelo, criado_em)
  values (p_anuncio, p_perfil, 'candidato', p_versao, p_curriculo_em, p_resultado, p_atende, p_obrigatorios_ok,
          left(p_modelo, 60), now())
  on conflict (anuncio_id, perfil_id) do update
    set origem = excluded.origem, versao = excluded.versao, curriculo_em = excluded.curriculo_em,
        resultado = excluded.resultado, atende = excluded.atende, obrigatorios_ok = excluded.obrigatorios_ok,
        modelo = excluded.modelo, criado_em = now();
  insert into privado.limites_uso (perfil_id, acao) values (conta, 'copiloto');
  select * into ultimo from privado.copiloto_registro r where r.anuncio_id = p_anuncio
   order by r.criado_em desc, r.id desc limit 1;
  if found and ultimo.acao = 'avaliou' and ultimo.detalhe = 'automatico'
     and ultimo.criado_em > now() - interval '15 minutes' then
    update privado.copiloto_registro set quantos = quantos + 1, criado_em = now() where id = ultimo.id;
  else
    insert into privado.copiloto_registro (anuncio_id, conta_id, pessoa_id, acao, quantos, detalhe)
    values (p_anuncio, conta, null, 'avaliou', 1, 'automatico');
  end if;
  return true;
end
$$;

revoke execute on function privado.copiloto_conferir_criterios(jsonb) from public, anon, authenticated;
revoke execute on function public.servidor_copiloto_vagas_sem_criterios(text, integer),
  public.servidor_copiloto_criterios_automaticos(text, uuid, jsonb), public.servidor_copiloto_fila(text, integer),
  public.servidor_copiloto_guardar(text, uuid, uuid, text, timestamptz, jsonb, integer, boolean, text) from public;
grant execute on function public.servidor_copiloto_vagas_sem_criterios(text, integer),
  public.servidor_copiloto_criterios_automaticos(text, uuid, jsonb), public.servidor_copiloto_fila(text, integer),
  public.servidor_copiloto_guardar(text, uuid, uuid, text, timestamptz, jsonb, integer, boolean, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
