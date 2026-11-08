-- A internet da pessoa caiu não é erro do Publike (08/11/2026).
--
-- O aviso "Erro ao salvar currículo · StorageUnknownError: Failed to fetch" era a internet do celular caindo no
-- meio do envio do PDF (o site já tenta 3 vezes sozinho). Agora:
-- 1. Etapa nova "internet": o navegador manda assim quando o erro é de rede ("Failed to fetch", "Load failed",
--    aparelho sem rede). A falha fica registrada em Admin › Falhas, como antes.
-- 2. Sem e-mail para a equipe por pessoa. Só avisa quando 5 pessoas diferentes (ou mais) tiverem a internet
--    caindo no mesmo formulário em 30 minutos: aí pode ser o site ou o Storage fora do ar. No máximo um aviso desses
--    a cada 6 horas.
-- 3. As falhas antigas com sinal de internet caída passam para a etapa nova.
-- Pode rodar de novo.

-- 1. A etapa nova --------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'privado.falhas_cadastro'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%etapa%'
  loop
    execute format('alter table privado.falhas_cadastro drop constraint %I', c.conname);
  end loop;
end
$$;

alter table privado.falhas_cadastro add constraint falhas_cadastro_etapa_check
  check (etapa in ('validacao', 'banco', 'arquivo', 'leitura', 'conexao', 'internet', 'inesperado'));

-- 3. As antigas -----------------------------------------------------------------------
update privado.falhas_cadastro
   set etapa = 'internet'
 where etapa in ('arquivo', 'conexao', 'leitura', 'inesperado')
   and coalesce(detalhe, '') ~* '(StorageUnknownError|failed to fetch|networkerror|load failed|network request failed|sem internet)';

-- 2. Registrar ------------------------------------------------------------------------
create or replace function public.registrar_falha_cadastro(
  p_onde text,
  p_etapa text,
  p_mensagem text,
  p_detalhe text default null,
  p_codigo text default null,
  p_campos text[] default '{}',
  p_pagina text default null,
  p_navegador text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := (select public.conta_atual());
  v_pessoa uuid := (select auth.uid());
  v_id bigint;
  v_chave text;
  v_total integer;
  v_resumo text;
  v_quem text;
  v_onde text := case p_onde when 'vaga' then 'Publicar ou editar vaga' else 'Salvar currículo' end;
  v_tipo text := case p_etapa
                   when 'validacao' then 'preenchimento'
                   when 'banco' then 'banco de dados'
                   when 'arquivo' then 'envio do PDF ou da foto'
                   when 'leitura' then 'leitura do arquivo pela IA'
                   when 'conexao' then 'o salvar não chegou ao servidor'
                   when 'internet' then 'a internet de várias pessoas caiu no envio'
                   else 'erro inesperado'
                 end;
begin
  if p_onde is null or p_onde not in ('vaga', 'curriculo')
     or p_etapa is null
     or p_etapa not in ('validacao', 'banco', 'arquivo', 'leitura', 'conexao', 'internet', 'inesperado') then
    return;
  end if;

  -- limites: 30 por conta por hora; sem conta, 300 por hora no total
  if v_conta is not null then
    if (select count(*) from privado.falhas_cadastro f
         where f.conta_id = v_conta and f.criado_em > now() - interval '1 hour') >= 30 then
      return;
    end if;
  elsif (select count(*) from privado.falhas_cadastro f
          where f.conta_id is null and f.criado_em > now() - interval '1 hour') >= 300 then
    return;
  end if;

  insert into privado.falhas_cadastro (onde, etapa, mensagem, detalhe, codigo, campos, pagina, navegador, conta_id, pessoa_id)
  values (
    p_onde,
    p_etapa,
    left(coalesce(nullif(btrim(p_mensagem), ''), '(sem mensagem)'), 500),
    left(nullif(btrim(p_detalhe), ''), 1000),
    left(nullif(btrim(p_codigo), ''), 60),
    coalesce((select array_agg(left(c, 60)) from unnest(p_campos[1:40]) c where c is not null), '{}'),
    left(nullif(btrim(p_pagina), ''), 300),
    left(nullif(btrim(p_navegador), ''), 300),
    v_conta,
    v_pessoa
  )
  returning id into v_id;

  -- limpeza de vez em quando
  if v_id % 200 = 0 then
    delete from privado.falhas_cadastro where criado_em < now() - interval '90 days';
  end if;

  if p_etapa = 'internet' then
    -- a internet de uma pessoa caiu: não é erro do Publike, não avisa. Muita gente ao mesmo tempo pode ser o site
    -- ou o Storage fora do ar: aí avisa, uma vez a cada 6 horas
    if (select count(distinct coalesce(f.pessoa_id::text, f.navegador, f.id::text))
          from privado.falhas_cadastro f
         where f.onde = p_onde and f.etapa = 'internet' and f.criado_em > now() - interval '30 minutes') < 5 then
      return;
    end if;
    v_chave := 'internet:' || p_onde;
    v_resumo := case p_onde
                  when 'vaga' then 'várias pessoas sem conseguir publicar a vaga (internet caindo)'
                  else 'várias pessoas sem conseguir enviar o currículo (internet caindo)'
                end;
    if exists (select 1 from privado.fila_emails e
                where e.modelo = 'aviso_falha' and e.criado_em > now() - interval '6 hours'
                  and e.dados ->> 'chave' = v_chave) then
      return;
    end if;
  -- erro de preenchimento: só avisa quando a pessoa travou
  elsif p_etapa = 'validacao' then
    if v_conta is null
       or (select count(*) from privado.falhas_cadastro f
            where f.conta_id = v_conta and f.onde = p_onde and f.etapa = 'validacao'
              and f.criado_em > now() - interval '30 minutes') < 3 then
      return;
    end if;
    v_chave := 'travou:' || v_conta || ':' || p_onde;
    v_resumo := case p_onde when 'vaga' then 'alguém não consegue publicar a vaga' else 'alguém não consegue salvar o currículo' end;
    if exists (select 1 from privado.fila_emails e
                where e.modelo = 'aviso_falha' and e.criado_em > now() - interval '6 hours'
                  and e.dados ->> 'chave' = v_chave) then
      return;
    end if;
  else
    v_chave := p_onde || ':' || p_etapa || ':' || coalesce(nullif(btrim(p_codigo), ''), left(btrim(coalesce(p_detalhe, p_mensagem, '')), 80));
    v_resumo := case p_onde when 'vaga' then 'erro ao publicar vaga' else 'erro ao salvar currículo' end;
    if exists (select 1 from privado.fila_emails e
                where e.modelo = 'aviso_falha' and e.criado_em > now() - interval '15 minutes'
                  and e.dados ->> 'chave' = v_chave) then
      return;
    end if;
  end if;

  -- um problema geral não lota a caixa
  if (select count(distinct e.dados ->> 'chave') from privado.fila_emails e
       where e.modelo = 'aviso_falha' and e.criado_em > now() - interval '1 hour') >= 20 then
    return;
  end if;

  select count(*) into v_total
    from privado.falhas_cadastro f
   where f.onde = p_onde and f.etapa = p_etapa and f.criado_em > now() - interval '24 hours'
     and (p_etapa = 'validacao' and f.conta_id = v_conta
          or p_etapa = 'internet'
          or p_etapa not in ('validacao', 'internet')
             and coalesce(f.codigo, '') = coalesce(left(nullif(btrim(p_codigo), ''), 60), ''));

  select coalesce(p.nome, 'conta sem nome') || ' (' || coalesce(p.tipo, '?') || ')' into v_quem
    from public.perfis p where p.id = v_conta;

  perform privado.avisar_equipe('aviso_falha', jsonb_build_object(
    'chave', v_chave,
    'resumo', upper(left(v_resumo, 1)) || substr(v_resumo, 2),
    'onde', v_onde,
    'tipo', v_tipo,
    'mensagem', left(coalesce(nullif(btrim(p_mensagem), ''), '(sem mensagem)'), 500),
    'detalhe', coalesce(left(nullif(btrim(p_detalhe), ''), 500),
                        case when cardinality(p_campos) > 0 then 'campos: ' || array_to_string(p_campos[1:20], ', ') end,
                        '—'),
    'quem', case when p_etapa = 'internet' then 'várias pessoas' else coalesce(v_quem, 'sem conta (ainda não entrou)') end,
    'pagina', coalesce(left(nullif(btrim(p_pagina), ''), 300), '—'),
    'total', v_total::text,
    'caminho', '/admin/falhas'));

  update privado.falhas_cadastro set avisado = true where id = v_id;
exception
  when others then
    -- registrar a falha nunca pode virar outra falha para a pessoa
    raise warning 'Publike: a falha não foi registrada (%).', sqlerrm;
end
$$;
