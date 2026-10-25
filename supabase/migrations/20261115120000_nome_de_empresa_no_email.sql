-- "Oi, Call." no e-mail da Call Center DentSmile (25/10/2026): conta marcada como pessoa, com nome de
-- empresa, recebia só a primeira palavra do nome. Agora, nome com cara de empresa vai inteiro.
-- As listas são as de tipoPeloNome (src/lib/nome-de-empresa.ts): mudou lá, mude aqui.
-- Pode rodar de novo sem problema.

create or replace function privado.nome_parece_empresa(p_nome text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text := lower(coalesce(p_nome, ''));
  p text[];
  empresa text[] := array[
    'rh', 'recrutamento', 'selecao', 'headhunter', 'terceirizacao', 'loja', 'lojas', 'salao', 'barbearia',
    'oficina', 'padaria', 'panificadora', 'restaurante', 'lanchonete', 'bar', 'mercado', 'supermercado',
    'mercearia', 'acougue', 'farmacia', 'drogaria', 'pizzaria', 'sorveteria', 'hamburgueria', 'cafeteria',
    'confeitaria', 'boutique', 'pet', 'petshop', 'papelaria', 'otica', 'autopecas', 'distribuidora',
    'atacadao', 'atacado', 'variedades', 'emporio', 'conveniencia', 'lavajato', 'borracharia', 'ltda', 'me',
    'mei', 'epp', 'eireli', 'sa', 'cia', 'consultoria', 'assessoria', 'contabilidade', 'advocacia',
    'advogados', 'associados', 'engenharia', 'construtora', 'construcoes', 'incorporadora', 'imobiliaria',
    'transportes', 'transportadora', 'logistica', 'industria', 'industrias', 'comercio', 'servicos',
    'solucoes', 'tecnologia', 'sistemas', 'grupo', 'holding', 'clinica', 'hospital', 'laboratorio',
    'odontologia', 'escola', 'colegio', 'faculdade', 'academia', 'hotel', 'pousada', 'buffet', 'eventos',
    'condominio', 'instituto', 'fundacao', 'associacao', 'igreja', 'cooperativa', 'agencia', 'studio',
    'estudio', 'escritorio', 'marketing', 'seguranca', 'limpeza', 'manutencao', 'representacoes',
    'importadora', 'exportadora', 'franquia', 'rede', 'center', 'centro', 'callcenter', 'telemarketing',
    'atendimento', 'shop', 'store', 'delivery', 'corp', 'company'
  ];
begin
  t := translate(t, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
  t := regexp_replace(t, 's\s*/\s*a\M', ' sa ', 'g');
  t := regexp_replace(t, 'auto\s*pecas', ' autopecas ', 'g');
  t := regexp_replace(t, 'lava\s*jato', ' lavajato ', 'g');
  t := regexp_replace(t, 'call\s*center', ' callcenter ', 'g');
  p := array(select w from regexp_split_to_table(t, '[^a-z0-9]+') w where w <> '');
  if coalesce(array_length(p, 1), 0) = 0 then
    return false;
  end if;
  -- "me" só vale no fim, como sufixo de empresa ("Me chama" é de pessoa)
  return exists (select 1 from unnest(p) with ordinality u(w, i)
                  where u.w = any (empresa) and (u.w <> 'me' or u.i = array_length(p, 1)))
      or ('agencia' = any (p) and 'emprego' = any (p))
      or p_nome ~ '&' or p_nome ~* '\mcnpj\M';
end
$$;
revoke execute on function privado.nome_parece_empresa(text) from public, anon, authenticated;

-- Primeiro nome para pessoas; nome inteiro para comércio, empresa, agência e para pessoa com nome de empresa.
create or replace function privado.nome_para_email(p_usuario uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.tipo = 'pessoa' and not privado.nome_parece_empresa(p.nome)
              then split_part(p.nome, ' ', 1) else p.nome end
    from public.perfis p where p.id = p_usuario
$$;
