-- Produção igual às migrações (depois de achar uma migração que nunca rodou e funções diferentes das migrações).
--
-- 1. privado.migracoes_aplicadas: cada migração, de agora em diante, termina com
--    select privado.migracao_aplicada('<nome do arquivo sem .sql>');
--    e o CI recusa a que não tiver essa linha (scripts/ci/conferir-registro-das-migracoes.mjs). As de antes entram
--    aqui de uma vez (todas já conferidas em produção pela migração 20270628120000).
-- 2. privado.impressao_do_banco(): um md5 curto de cada função, coluna, índice, gatilho e política de public e
--    privado (e das políticas do storage), sem comentários, espaços e o prefixo "extensions." (o que não muda nada).
--    O CI confere que src/lib/gerado/banco-esperado.json é a impressão de um banco novo com todas as migrações; o
--    site compara com a de produção em /api/banco, que a tarefa .github/workflows/banco.yml chama de hora em hora e
--    que falha (o GitHub manda e-mail) quando falta migração ou algo em produção está diferente das migrações.

create table if not exists privado.migracoes_aplicadas (
  nome text primary key,
  registrada_em timestamptz not null default now()
);
alter table privado.migracoes_aplicadas enable row level security;
revoke all on privado.migracoes_aplicadas from public, anon, authenticated;

create or replace function privado.migracao_aplicada(p_nome text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into privado.migracoes_aplicadas (nome) values (p_nome) on conflict (nome) do nothing
$$;
revoke execute on function privado.migracao_aplicada(text) from public, anon, authenticated;

-- o texto sem o que não muda o banco: comentários de linha, espaços e o prefixo do esquema das extensões
create or replace function privado.sql_comparavel(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(regexp_replace(replace(coalesce(p, ''), 'extensions.', ''), '--[^\n]*', '', 'g'), '\s+', '', 'g')
$$;

create or replace function privado.impressao_do_banco()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with obj as (
    select 'f|' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as nome,
           privado.sql_comparavel(p.prosrc) || '|' || privado.sql_comparavel(pg_get_function_result(p.oid)) || '|'
             || p.provolatile::text || '|' || p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '') as valor
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'privado')
       and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
    union all
    select 'c|' || n.nspname || '.' || c.relname || '.' || a.attname,
           privado.sql_comparavel(format_type(a.atttypid, a.atttypmod)) || '|' || a.attnotnull::text
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'privado') and c.relkind in ('r', 'p', 'v', 'm') and a.attnum > 0 and not a.attisdropped
       and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
    union all
    select 'i|' || n.nspname || '.' || c.relname, privado.sql_comparavel(pg_get_indexdef(c.oid))
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'privado') and c.relkind = 'i'
       and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
    union all
    select 't|' || n.nspname || '.' || c.relname || '.' || t.tgname, privado.sql_comparavel(pg_get_triggerdef(t.oid))
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where not t.tgisinternal and n.nspname in ('public', 'privado')
    union all
    select 'p|' || n.nspname || '.' || c.relname || '.' || p.polname,
           privado.sql_comparavel(pg_get_expr(p.polqual, p.polrelid)) || '|'
             || privado.sql_comparavel(pg_get_expr(p.polwithcheck, p.polrelid)) || '|' || p.polcmd::text || '|'
             || p.polpermissive::text || '|'
             || coalesce((select string_agg(case when r = 0 then 'public' else r::regrole::text end, ',' order by 1)
                            from unnest(p.polroles) r), '')
      from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'privado', 'storage')
  )
  select coalesce(jsonb_object_agg(nome, left(md5(valor), 10)), '{}'::jsonb) from obj
$$;
revoke execute on function privado.impressao_do_banco() from public, anon, authenticated;

-- para o site (/api/banco): as migrações registradas e a impressão de produção
create or replace function public.servidor_saude_do_banco(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return jsonb_build_object(
    'migracoes', coalesce((select jsonb_agg(m.nome order by m.nome) from privado.migracoes_aplicadas m), '[]'::jsonb),
    'objetos', privado.impressao_do_banco());
end
$$;
revoke execute on function public.servidor_saude_do_banco(text) from public, authenticated;
grant execute on function public.servidor_saude_do_banco(text) to anon, service_role;

-- as migrações de antes desta (todas aplicadas em produção, conferidas pela 20270628120000)
insert into privado.migracoes_aplicadas (nome) values
  ('20261007120000_publike'),
  ('20261008120000_admin'),
  ('20261009120000_prioridade_local'),
  ('20261009150000_servicos'),
  ('20261009180000_avaliacoes'),
  ('20261009200000_curriculos'),
  ('20261009210000_config_where'),
  ('20261009230000_desfazer_match'),
  ('20261009240000_negociar_depois'),
  ('20261009250000_agencias'),
  ('20261009260000_cnpj_empresas'),
  ('20261009270000_descobrir'),
  ('20261009280000_enderecos'),
  ('20261009290000_logo_emails'),
  ('20261010120000_sugestoes_assistente'),
  ('20261011120000_etapas_candidatos'),
  ('20261011150000_conversas'),
  ('20261011170000_negociar_de_novo'),
  ('20261011190000_intencao'),
  ('20261013120000_seguir_recomendar_contratados'),
  ('20261013180000_seguranca_e_lgpd'),
  ('20261013200000_origem_campanhas'),
  ('20261014120000_ponto_conhecido'),
  ('20261015120000_vaga_completa'),
  ('20261015150000_aceite_pendente'),
  ('20261015170000_boas_vindas'),
  ('20261015180000_servicos_pelo_admin'),
  ('20261015190000_boas_vindas_prestador'),
  ('20261015200000_convites'),
  ('20261015210000_noticias'),
  ('20261015220000_mais_regimes'),
  ('20261016120000_vaga_personalizada'),
  ('20261016150000_recrutamento'),
  ('20261016180000_aceite_com_curriculo'),
  ('20261017090000_avisos_de_busca'),
  ('20261017120000_talentos_e_resumo'),
  ('20261018120000_curriculo_no_chat'),
  ('20261018150000_fotos_noticias'),
  ('20261018160000_fotos_licenca'),
  ('20261018180000_fotos_pixabay'),
  ('20261018200000_convites_aceite'),
  ('20261018220000_acesso_por_link'),
  ('20261018230000_convites_prestador'),
  ('20261019120000_contato_direto'),
  ('20261019150000_vaga_preenchida_e_prazo'),
  ('20261019170000_clientes_agencia'),
  ('20261019190000_talentos_na_busca'),
  ('20261019210000_intencao_talento'),
  ('20261019230000_ganhos_extras'),
  ('20261019240000_curriculo_estudos'),
  ('20261019250000_acessos_site'),
  ('20261019260000_finalistas'),
  ('20261019270000_agenda_entrevista'),
  ('20261019280000_colocacoes'),
  ('20261019290000_candidato_de_fora'),
  ('20261020120000_equipe_agencia'),
  ('20261020150000_conexoes'),
  ('20261020180000_conversa_unica'),
  ('20261021120000_home_linha'),
  ('20261022120000_recados'),
  ('20261023120000_conexoes_todos'),
  ('20261024120000_modos_da_conta'),
  ('20261025120000_curtidas_das_vagas'),
  ('20261026120000_busca_por_relevancia'),
  ('20261027120000_convites_por_email'),
  ('20261028120000_convites_no_sino'),
  ('20261029120000_banners'),
  ('20261030120000_curriculo_publico'),
  ('20261031120000_visitas_perfil'),
  ('20261101120000_relevancia_das_vagas'),
  ('20261101130000_talentos_de_toda_regiao'),
  ('20261102120000_esperando_ia'),
  ('20261103120000_recado_com_curriculo'),
  ('20261104120000_falhas_cadastro'),
  ('20261105120000_editar_recado'),
  ('20261106120000_veredito_da_moderacao'),
  ('20261107120000_saude_do_site'),
  ('20261108120000_responsavel_da_conta'),
  ('20261109120000_motivo_do_encerramento'),
  ('20261110120000_mensagem_da_equipe'),
  ('20261111120000_resposta_da_equipe'),
  ('20261112120000_notificacoes_no_celular'),
  ('20261113120000_situacao_das_notificacoes'),
  ('20261114120000_acessos_por_hora'),
  ('20261115120000_nome_de_empresa_no_email'),
  ('20261116120000_contato_liberado_sem_resposta'),
  ('20261117120000_banners_paginas_e_atraso'),
  ('20261118120000_nome_curto_sem_negocio'),
  ('20261119120000_combinam_da_semana'),
  ('20261120120000_avisos_por_tipo'),
  ('20261121120000_empresas_avisadas'),
  ('20261122120000_emails_por_dia'),
  ('20261123120000_painel_no_site'),
  ('20261124120000_experiencia_sem_data'),
  ('20261125120000_convite_concluir_perfil'),
  ('20261126120000_emails_enviados_desde'),
  ('20261127120000_numeros_teste_app'),
  ('20261128120000_aparelho_do_ultimo_acesso'),
  ('20261129120000_comunicados'),
  ('20261130120000_online_e_voltaram'),
  ('20261201120000_ia_reserva'),
  ('20261202120000_aviso_noticias'),
  ('20261203120000_copiloto'),
  ('20261204120000_avaliacoes'),
  ('20261205120000_recentes_e_curtidas'),
  ('20261206120000_admin_corrigir_nome'),
  ('20261207120000_metricas_de_produto'),
  ('20261208120000_tempo_na_pagina'),
  ('20261209120000_empresas_catalogo'),
  ('20261210120000_empresas_contas'),
  ('20261211120000_resposta_e_avisos'),
  ('20261212120000_comeca_ja'),
  ('20261213120000_banners_imagem'),
  ('20261214120000_banners_filtros'),
  ('20261215120000_experimentar'),
  ('20261216120000_funil_publicar'),
  ('20261217120000_presenca_sem_equipe'),
  ('20261218120000_pagamentos'),
  ('20261219120000_pagamentos_situacao'),
  ('20261220120000_pagamentos_combo'),
  ('20261221120000_pagamentos_endereco'),
  ('20261222120000_nome_triagem'),
  ('20261223120000_nome_teste_pratico'),
  ('20261224120000_teste_gratis'),
  ('20261225120000_teste_tempo'),
  ('20261226120000_triagem_aviso'),
  ('20261227120000_triagem_automatica'),
  ('20261228120000_triagem_funil'),
  ('20261229120000_triagem_fila_volatil'),
  ('20261230120000_retorno'),
  ('20261231120000_whatsapp_permissao'),
  ('20270101120000_finalistas_empresa'),
  ('20270102120000_escolher_horario'),
  ('20270103120000_chamar_de_novo'),
  ('20270104120000_recurso_video'),
  ('20270105120000_entrevista_video'),
  ('20270106120000_entrevista_ao_vivo'),
  ('20270107120000_avaliacao_time'),
  ('20270108120000_etapas_e_horarios'),
  ('20270109120000_automacoes_e_numeros'),
  ('20270110120000_proposta'),
  ('20270111120000_mais_automacoes'),
  ('20270112120000_busca_sem_postgis'),
  ('20270113120000_contas_apagadas'),
  ('20270114120000_automacoes_sob_medida'),
  ('20270115120000_regras_personalizadas'),
  ('20270116120000_plano_completo'),
  ('20270117120000_pagina_de_vagas'),
  ('20270118120000_novidades_do_publike'),
  ('20270119120000_contas_no_app'),
  ('20270120120000_carreiras_titulo_e_fotos'),
  ('20270121120000_app_so_do_publike'),
  ('20270122120000_novidades'),
  ('20270123120000_banners_destaque'),
  ('20270124120000_funil_visitante'),
  ('20270125120000_pagamentos_sandbox'),
  ('20270126120000_ia_sem_conta'),
  ('20270127120000_retorno_das_empresas'),
  ('20270128120000_testadores_app'),
  ('20270129120000_quero_testar_app'),
  ('20270130120000_crescimento_empresas'),
  ('20270131120000_salarios_do_mercado'),
  ('20270201120000_central_de_emails'),
  ('20270202120000_perguntas_no_match'),
  ('20270203120000_emails_enviados'),
  ('20270204120000_lida_e_nao_lida'),
  ('20270205120000_confirmacao_de_leitura'),
  ('20270206120000_entrevista_na_conversa'),
  ('20270207120000_matches_sem_contato_na_tela'),
  ('20270208120000_ia_por_funcionalidade'),
  ('20270209120000_match_pelo_contexto'),
  ('20270210120000_uso_da_ia'),
  ('20270211120000_uso_da_ia_buscas'),
  ('20270212120000_aviso_de_liberacao'),
  ('20270213120000_ultimo_acesso_nas_curtidas'),
  ('20270214120000_talento_que_combina'),
  ('20270215120000_quem_respondeu_a_curtida'),
  ('20270216120000_ultimo_acesso_em_todo_o_admin'),
  ('20270217120000_banner_em_varios_formatos'),
  ('20270218120000_consulta_de_salarios'),
  ('20270219120000_contato_nas_curtidas'),
  ('20270220120000_pergunta_do_match_ao_entrar'),
  ('20270221120000_conversa_so_no_chat'),
  ('20270222120000_google_vagas'),
  ('20270223120000_comunicado_sem_curriculo'),
  ('20270224120000_agora_nao_no_whatsapp'),
  ('20270225120000_prazo_da_entrevista_em_video'),
  ('20270226120000_porta_de_entrada'),
  ('20270227120000_reputacao'),
  ('20270228120000_trilha_da_vaga'),
  ('20270301120000_carreiras_banner_e_destaques'),
  ('20270302120000_resposta_automatica'),
  ('20270303120000_funil_do_chat'),
  ('20270304120000_curtidas_para_moderador'),
  ('20270305120000_convidar_varios'),
  ('20270306120000_testes_gerais'),
  ('20270307120000_pedidos_do_cliente'),
  ('20270308120000_buscas_talentos'),
  ('20270309120000_jeito_de_trabalhar'),
  ('20270310120000_feed_de_vagas'),
  ('20270311120000_indicacao'),
  ('20270312120000_documentos_admissao'),
  ('20270313120000_mensagens_das_automacoes'),
  ('20270314120000_chat_nas_curtidas'),
  ('20270315120000_processo_e_padroes'),
  ('20270316120000_falhas_de_internet'),
  ('20270317120000_indicar_por_email'),
  ('20270318120000_comentarios'),
  ('20270319120000_comentarios_no_feed'),
  ('20270320120000_admin_tipo_e_cnpj'),
  ('20270321120000_recado_vira_post'),
  ('20270322120000_conquistas'),
  ('20270323120000_modelos_do_post'),
  ('20270324120000_respostas_no_feed'),
  ('20270325120000_admin_etapa_no_email'),
  ('20270326120000_pessoa_quer_contratar'),
  ('20270327120000_telas_do_admin'),
  ('20270328120000_email_valido'),
  ('20270329120000_documentos_sem_visitante'),
  ('20270329130000_relatorio_da_csp'),
  ('20270330120000_numeros_para_moderador'),
  ('20270331120000_indicadores_do_admin'),
  ('20270401120000_indicadores_historico'),
  ('20270402120000_dinheiro_do_admin'),
  ('20270403120000_metas_e_numeros_da_semana'),
  ('20270404120000_anuncio_repetido'),
  ('20270405120000_conversa_da_moderacao'),
  ('20270406120000_carreiras_a_venda'),
  ('20270407120000_planos_empresa_e_agencia'),
  ('20270408120000_finalistas_com_a_marca'),
  ('20270409120000_relatorio_do_cliente'),
  ('20270410120000_garantia_com_o_cliente'),
  ('20270411120000_dossie_do_finalista'),
  ('20270412120000_prazo_para_mudar_de_faixa'),
  ('20270413120000_mais_recentes_pela_data'),
  ('20270413130000_vinte_vagas_gratis_e_plano_acima'),
  ('20270414120000_cancelar_entrevista_em_video'),
  ('20270415120000_resposta_dos_ultimos_30_dias'),
  ('20270416120000_anual_30_dias_e_mudar_de_faixa'),
  ('20270417120000_mutirao'),
  ('20270418120000_convite_automatico'),
  ('20270419120000_mapa_de_talentos'),
  ('20270420120000_limite_ao_vivo'),
  ('20270421120000_plano_no_lugar_do_recurso'),
  ('20270422120000_visoes_das_vagas'),
  ('20270423120000_impulsionar'),
  ('20270424120000_impulso_pelo_admin'),
  ('20270425120000_impulsos_no_site'),
  ('20270426120000_indexnow'),
  ('20270427120000_vaga_fora_do_ar'),
  ('20270428120000_impulso_automatico'),
  ('20270429120000_impulso_conta_google'),
  ('20270430120000_impulso_por_cliente'),
  ('20270501120000_impulso_medir_a_cada_2_horas'),
  ('20270502120000_acessos_com_conta_sem_equipe'),
  ('20270503120000_lembrete_e_indicador_do_curriculo'),
  ('20270504120000_impulso_sem_disputa_e_raio'),
  ('20270505120000_impulso_caminho'),
  ('20270506120000_vagas_impulsionadas'),
  ('20270507120000_impulso_palavras_uma_vez_por_dia'),
  ('20270508120000_impulso_ia_nas_palavras'),
  ('20270509120000_impulso_ajuste_diario'),
  ('20270510120000_servidor_nunca_stable'),
  ('20270511120000_impulso_uma_volta_por_vez'),
  ('20270512120000_impulso_teto_do_clique'),
  ('20270513120000_candidatura_no_site'),
  ('20270514120000_impulso_atualizar_agora'),
  ('20270515120000_impulso_presente_e_minimo_por_dia'),
  ('20270516120000_impulso_planos_curtos'),
  ('20270517120000_impulso_nome_do_cliente'),
  ('20270518120000_impulso_garantia_da_verba'),
  ('20270519120000_impulso_pacote_de_candidatos'),
  ('20270520120000_impulso_chave_da_geral'),
  ('20270521120000_impulso_destaque_na_lista'),
  ('20270522120000_impulso_grupos_da_geral'),
  ('20270523120000_impulso_raios_da_geral'),
  ('20270524120000_impulso_grupos_e_raios_para_o_robo'),
  ('20270525120000_remocao_agendada'),
  ('20270526120000_tres_perguntas_do_retorno'),
  ('20270527120000_historico_da_moderacao'),
  ('20270528120000_impulso_numeros_da_geral'),
  ('20270529120000_aviso_de_vencimento'),
  ('20270530120000_admin_lista_te_respondeu'),
  ('20270531120000_retorno_no_site'),
  ('20270601120000_impulso_geral_por_dia'),
  ('20270602120000_empresas_da_receita'),
  ('20270603120000_busca_de_empresas'),
  ('20270604120000_convites_da_receita'),
  ('20270605120000_rota_do_curriculo'),
  ('20270606120000_abriu_perto_e_rota'),
  ('20270607120000_ramos_sem_delete_solto'),
  ('20270608120000_convites_receita_sair'),
  ('20270609120000_ramos_que_pesam'),
  ('20270610120000_abriu_perto_pela_base'),
  ('20270611120000_abriu_perto_rapido'),
  ('20270612120000_abriu_perto_plpgsql'),
  ('20270613120000_rota_sem_conta'),
  ('20270614120000_abriu_perto_do_ponto'),
  ('20270615120000_quero_trabalhar_aqui'),
  ('20270616120000_lugares_sem_nome'),
  ('20270617120000_carga_so_o_que_mudou'),
  ('20270618120000_rota_rapida'),
  ('20270619120000_whatsapp_oficial'),
  ('20270620120000_whatsapp_configuracao_envios'),
  ('20270621120000_remocao_conta_contato_direto'),
  ('20270622120000_rota_mapa_primeiro'),
  ('20270623120000_rota_sem_esperar'),
  ('20270624120000_quem_contrata_perto'),
  ('20270625120000_ramo_e_lugar_no_mesmo_indice'),
  ('20270626120000_contato_no_convite'),
  ('20270627120000_contratar_com_vaga'),
  ('20270628120000_producao_alinhada')
on conflict (nome) do nothing;

select privado.migracao_aplicada('20270629110000_registro_e_impressao_do_banco');
