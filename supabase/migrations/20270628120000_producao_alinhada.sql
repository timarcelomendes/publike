-- Produção alinhada com as migrações (16/11/2026, Marcelo: "confirme as migrações"). A comparação de produção com um
-- banco novo com as 311 migrações achou:
--   * 20261221120000_pagamentos_endereco nunca rodou: faltavam privado.clientes_pagamento.telefone e .endereco,
--     public.meu_endereco_de_cobranca() e public.servidor_pagamento_endereco(). Vai aqui inteira (pode rodar de novo).
--   * 5 funções com o corpo antigo em produção (as outras diferenças eram só comentários e espaços): ficam como no
--     banco novo, a versão da última migração de cada uma.
-- Pode rodar de novo.

-- O endereço de cobrança e o celular de quem paga no cartão: o checkout do Asaas pede (telefone, endereço,
-- número, CEP e bairro do cliente). Guardado para vir preenchido na próxima vez. Pode rodar de novo.
alter table privado.clientes_pagamento add column if not exists telefone text
  check (telefone is null or telefone ~ '^[0-9]{10,11}$');
alter table privado.clientes_pagamento add column if not exists endereco jsonb
  check (endereco is null or (jsonb_typeof(endereco) = 'object' and octet_length(endereco::text) <= 1000));

-- a tela de assinar: o que já foi informado
create or replace function public.meu_endereco_de_cobranca()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('telefone', c.telefone, 'endereco', c.endereco)
    from privado.clientes_pagamento c
   where (select auth.uid()) is not null and c.conta_id = public.conta_atual()
$$;
revoke execute on function public.meu_endereco_de_cobranca() from public, anon;
grant execute on function public.meu_endereco_de_cobranca() to authenticated;

create or replace function public.servidor_pagamento_endereco(p_chave text, p_conta uuid, p_telefone text,
                                                              p_endereco jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.clientes_pagamento
     set telefone = p_telefone, endereco = p_endereco, atualizado_em = now()
   where conta_id = p_conta;
end
$$;
revoke execute on function public.servidor_pagamento_endereco(text, uuid, text, jsonb) from public;
grant execute on function public.servidor_pagamento_endereco(text, uuid, text, jsonb)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- as 5 funções, como ficam depois de todas as migrações
CREATE OR REPLACE FUNCTION public.admin_empresas_receita()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ref date := privado.ultima_abertura();
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'cargas', coalesce((select jsonb_agg(jsonb_build_object('mes', c.mes, 'situacao', c.situacao,
                          'comecou_em', c.comecou_em, 'terminou_em', c.terminou_em,
                          'estabelecimentos', c.estabelecimentos, 'resumo', c.resumo) order by c.mes desc)
                        from (select * from privado.cargas_receita order by mes desc limit 6) c), '[]'::jsonb),
    'ativas', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and not e.mei),
    'meis_na_base', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.mei),
    'agencias_mei', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.agencia and e.mei),
    'na_praca', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.na_praca and not e.mei),
    'com_ponto', (select count(*) from privado.empresas_receita e
                   where e.situacao = 'ativa' and not e.mei and e.local is not null),
    'agencias', (select count(*) from privado.empresas_receita e where e.situacao = 'ativa' and e.agencia),
    'abertas_60_dias', (select count(*) from privado.empresas_receita e
                         where e.situacao = 'ativa' and e.na_praca and not e.mei and e.data_abertura >= v_ref - 60),
    'por_cidade', coalesce((select jsonb_agg(jsonb_build_object('cidade', x.cidade, 'quantas', x.n) order by x.n desc)
                             from (select e.cidade, count(*) as n from privado.empresas_receita e
                                    where e.situacao = 'ativa' and e.na_praca and not e.mei group by e.cidade) x), '[]'::jsonb),
    'meis', (select coalesce(sum(m.quantos), 0) from privado.mei_por_bairro m),
    'meis_60_dias', (select coalesce(sum(m.quantos), 0) from privado.mei_por_bairro m
                      where m.mes_abertura >= date_trunc('month', v_ref - 60)),
    'ramos_com_nome', (select count(*) from privado.ramos_do_publike),
    'ramos_funcoes', (select count(*) from privado.ramos_funcoes));
end
$function$
;

CREATE OR REPLACE FUNCTION public.admin_lista_receita(p_lista text, p_cidade text DEFAULT NULL::text, p_cnaes text[] DEFAULT NULL::text[], p_dias integer DEFAULT 60, p_limite integer DEFAULT 50, p_pagina integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_dias integer := least(greatest(coalesce(p_dias, 60), 1), 730);
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_pagina integer := greatest(coalesce(p_pagina, 0), 0);
  v_total integer;
  v_linhas jsonb;
  v_ref date := privado.ultima_abertura();
begin
  if not privado.eh_admin() then
    raise exception 'Só o admin vê as listas da Receita.' using errcode = '42501';
  end if;
  if p_lista not in ('abriram', 'agencias', 'prestadores') then
    raise exception 'Lista inválida.' using errcode = '22023';
  end if;

  with base as (
    select e.*
      from privado.empresas_receita e
     where e.situacao = 'ativa'
       and not exists (select 1 from privado.receita_sem_convite s where s.cnpj = e.cnpj)
       and (p_cidade is null or e.cidade = p_cidade)
       and case p_lista
             when 'abriram' then not e.mei and e.na_praca
                                 and e.data_abertura >= v_ref - v_dias
             when 'agencias' then e.agencia
             else e.mei and e.na_praca and e.cnae = any(coalesce(p_cnaes, '{}'))
                  and (p_dias is null or e.data_abertura >= v_ref - v_dias)
           end
  )
  select count(*) into v_total from base;

  with base as (
    select e.*,
           nullif(regexp_replace(coalesce(e.telefone, ''), '\D', '', 'g'), '') as tel
      from privado.empresas_receita e
     where e.situacao = 'ativa'
       and not exists (select 1 from privado.receita_sem_convite s where s.cnpj = e.cnpj)
       and (p_cidade is null or e.cidade = p_cidade)
       and case p_lista
             when 'abriram' then not e.mei and e.na_praca
                                 and e.data_abertura >= v_ref - v_dias
             when 'agencias' then e.agencia
             else e.mei and e.na_praca and e.cnae = any(coalesce(p_cnaes, '{}'))
                  and (p_dias is null or e.data_abertura >= v_ref - v_dias)
           end
  ), pagina as (
    select b.*
      from base b
     order by (b.telefone is not null or b.email is not null) desc,
              case when p_lista = 'agencias' then (case when b.na_praca then 0 else 1 end) else 0 end,
              case when p_lista = 'agencias' then (case b.porte when 'demais' then 0 when 'pequena' then 1 else 2 end) else 0 end,
              b.data_abertura desc nulls last, b.nome, b.cnpj
     limit v_limite offset v_pagina * v_limite
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cnpj', p.cnpj, 'nome', p.nome, 'razao_social', p.razao_social, 'cnae', p.cnae, 'ramo', r.nome,
           'bairro', p.bairro, 'cidade', p.cidade, 'cep', p.cep,
           'endereco', case when p.mei then null else concat_ws(', ', p.logradouro, p.numero) end,
           'abertura', p.data_abertura, 'porte', p.porte, 'mei', p.mei, 'matriz', p.matriz, 'na_praca', p.na_praca,
           'telefone', p.telefone, 'email', p.email,
           'no_publike', exists (select 1 from public.perfis pf where pf.cnpj = p.cnpj),
           'convite', (select jsonb_build_object('id', cv.id, 'status', cv.status, 'criado_em', cv.criado_em)
                         from public.convites cv
                        where cv.cnpj_receita = p.cnpj
                           or (p.tel is not null and (p.tel = any(cv.whatsapp) or p.tel = any(cv.telefones)))
                        order by cv.criado_em desc
                        limit 1))
         order by (p.telefone is not null or p.email is not null) desc,
                  case when p_lista = 'agencias' then (case when p.na_praca then 0 else 1 end) else 0 end,
                  case when p_lista = 'agencias' then (case p.porte when 'demais' then 0 when 'pequena' then 1 else 2 end) else 0 end,
                  p.data_abertura desc nulls last, p.nome, p.cnpj), '[]'::jsonb)
    into v_linhas
    from pagina p
    left join privado.ramos_do_publike r on r.cnae = p.cnae;

  return jsonb_build_object(
    'total', v_total,
    'pagina', v_pagina,
    'limite', v_limite,
    'linhas', v_linhas,
    'cidades', coalesce((select jsonb_agg(x.cidade order by x.n desc)
                           from (select e.cidade, count(*) as n from privado.empresas_receita e
                                  where e.situacao = 'ativa' and (e.na_praca or p_lista = 'agencias')
                                  group by e.cidade) x), '[]'::jsonb));
end
$function$
;

CREATE OR REPLACE FUNCTION public.marca_dos_finalistas(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- 'plano' diz que a agência tem o Plano Agência (o link mostra o dossiê de cada finalista, 20270411120000)
  select jsonb_build_object(
           'plano', true,
           'cor', p.cor,
           'foto', coalesce((to_jsonb(p) -> 'fotos' ->> 0), p.capa))
    from public.links_finalistas l
    join public.anuncios a on a.id = l.anuncio_id
    left join public.paginas_de_vagas p on p.conta_id = a.autor_id
   where coalesce(p_token, '') ~ '^[0-9a-f]{64}$' and l.token = p_token
     and privado.agencia_com_plano(a.autor_id)
   limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.servidor_ramos_salvar(p_chave text, p_linhas jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n integer;
begin
  perform privado.exigir_servidor(p_chave);
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0
     or jsonb_array_length(p_linhas) > 200000 then
    raise exception 'Mande a lista dos ramos.' using errcode = '22023';
  end if;
  delete from privado.ramos_funcoes where true;
  insert into privado.ramos_funcoes (cnae, cbo, contratacoes)
  select l ->> 'cnae', l ->> 'cbo', (l ->> 'contratacoes')::integer
    from jsonb_array_elements(p_linhas) l
   where (l ->> 'cnae') ~ '^[0-9]{7}$' and (l ->> 'cbo') ~ '^[0-9]{6}$' and coalesce((l ->> 'contratacoes')::integer, 0) > 0
  on conflict (cnae, cbo) do update set contratacoes = excluded.contratacoes, atualizado_em = now();
  get diagnostics n = row_count;
  return n;
end
$function$
;

CREATE OR REPLACE FUNCTION public.servidor_resultado_avaliacao(p_chave text, p_avaliacao bigint, p_parte text, p_versao text, p_decisao text, p_categorias text[] DEFAULT '{}'::text[], p_explicacao text DEFAULT NULL::text, p_modelo text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  fila privado.fila_ia_avaliacoes;
  v public.avaliacoes;
  categorias text[];
begin
  perform privado.exigir_servidor(p_chave);
  if p_decisao not in ('aprovado', 'retido', 'erro') or p_parte not in ('comentario', 'resposta') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  select * into fila from privado.fila_ia_avaliacoes f where f.avaliacao_id = p_avaliacao and f.parte = p_parte for update;
  if not found then
    return 'ignorado';
  end if;
  select * into v from public.avaliacoes where id = p_avaliacao for update;
  if not found then
    delete from privado.fila_ia_avaliacoes where avaliacao_id = p_avaliacao and parte = p_parte;
    return 'ignorado';
  end if;
  -- o texto mudou enquanto a IA pensava: revisa de novo
  if md5(coalesce(case when p_parte = 'comentario' then v.comentario else v.resposta end, '')) is distinct from p_versao then
    update privado.fila_ia_avaliacoes set status = 'pendente', tentativas = 0, tentar_depois = now()
     where avaliacao_id = p_avaliacao and parte = p_parte;
    return 'desatualizado';
  end if;
  if p_decisao = 'erro' and fila.tentativas < 3 then
    update privado.fila_ia_avaliacoes
       set status = 'pendente', tentar_depois = now() + fila.tentativas * interval '5 minutes'
     where avaliacao_id = p_avaliacao and parte = p_parte;
    return 'tentar_de_novo';
  end if;
  select coalesce(array_agg(distinct c), '{}') into categorias
    from (select c from unnest(coalesce(p_categorias, '{}')) as c where c ~ '^[a-z_]{2,40}$' limit 8) t;
  delete from privado.fila_ia_avaliacoes where avaliacao_id = p_avaliacao and parte = p_parte;
  insert into public.moderacao_ia_avaliacoes (avaliacao_id, parte, decisao, categorias, explicacao, modelo)
  values (p_avaliacao, p_parte, p_decisao, categorias, left(p_explicacao, 1000), left(p_modelo, 80));

  if p_decisao = 'aprovado' then
    if p_parte = 'comentario' then
      update public.avaliacoes set status = 'publicada' where id = p_avaliacao and status = 'pendente';
      perform privado.avisar_avaliacao_publicada(p_avaliacao);
    else
      update public.avaliacoes set resposta_status = 'publicada' where id = p_avaliacao and resposta_status = 'pendente';
    end if;
  elsif p_decisao = 'retido' then
    perform privado.reter_texto_de_avaliacao(p_avaliacao, p_parte, p_explicacao);
  end if;
  -- 'erro' depois de três tentativas: continua escondido e aparece na fila da equipe
  return p_decisao;
end
$function$
;

notify pgrst, 'reload schema';
