-- Desistir do "Quero trabalhar aqui" (16/11/2026, "ter a opção de desistir do quero trabalhar aqui"): o interesse fica
-- marcado como desistido (e não some: ele continua contando no limite de 20 por dia, para o "quero" e o "desisti" não
-- virarem um jeito de mandar avisos sem fim) e o aviso da empresa no Publike sai do sino dela. Querer de novo volta a
-- valer, com o aviso de novo.

alter table privado.interesses_locais add column if not exists desistiu_em timestamptz;

create or replace function public.demonstrar_interesse(p_cnpj text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_eu uuid := auth.uid();
  v_conta uuid;
  v_lugar text;
  v_nome text;
  v_funcao text;
begin
  if v_eu is null then
    raise exception 'Entre para demonstrar interesse.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perfis p where p.id = v_eu and p.tipo = 'pessoa') then
    raise exception 'Só quem procura trabalho demonstra interesse.' using errcode = '42501';
  end if;
  select x.nome into v_lugar from privado.empresas_receita x
   where x.cnpj = p_cnpj and x.situacao = 'ativa' and not x.mei;
  if v_lugar is null then
    raise exception 'Esse lugar não está na base.' using errcode = '22023';
  end if;
  v_conta := privado.conta_do_cnpj(p_cnpj);
  if exists (select 1 from privado.interesses_locais i
              where i.perfil_id = v_eu and i.cnpj = p_cnpj and i.desistiu_em is null) then
    return jsonb_build_object('avisada', v_conta is not null, 'ja', true);
  end if;
  if v_conta is not null and (select count(*) from privado.interesses_locais i
                                where i.perfil_id = v_eu and i.conta_id is not null
                                  and i.criado_em > now() - interval '1 day') >= 20 then
    raise exception 'Você já demonstrou interesse em muitos lugares hoje. Amanhã dá de novo.' using errcode = '54000';
  end if;
  -- quem desistiu e quer de novo: volta a valer (e conta de novo no limite do dia)
  insert into privado.interesses_locais (perfil_id, cnpj, conta_id) values (v_eu, p_cnpj, v_conta)
  on conflict (perfil_id, cnpj) do update set conta_id = excluded.conta_id, criado_em = now(), desistiu_em = null;
  if v_conta is not null then
    select privado.nome_para_email(v_eu) into v_nome;
    select nullif(btrim(c.titulo), '') into v_funcao from public.curriculos c where c.perfil_id = v_eu;
    insert into public.notificacoes (destinatario_id, tipo, ator_id, texto, link)
    values (v_conta, 'interesse_local', v_eu,
            coalesce(nullif(btrim(v_nome), ''), 'Uma pessoa da região')
              || coalesce(' (' || lower(v_funcao) || ')', '')
              || ' quer trabalhar com vocês e mandou o currículo pelo Publike.',
            '/talentos/' || v_eu);
  end if;
  return jsonb_build_object('avisada', v_conta is not null, 'ja', false);
end
$$;

create or replace function public.desistir_interesse(p_cnpj text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_eu uuid := auth.uid();
  v_conta uuid;
begin
  if v_eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  update privado.interesses_locais i set desistiu_em = now()
   where i.perfil_id = v_eu and i.cnpj = p_cnpj and i.desistiu_em is null
  returning i.conta_id into v_conta;
  if not found then
    return false;
  end if;
  if v_conta is not null then
    delete from public.notificacoes n
     where n.destinatario_id = v_conta and n.tipo = 'interesse_local' and n.ator_id = v_eu;
  end if;
  return true;
end
$$;
revoke execute on function public.desistir_interesse(text) from public, anon;
grant execute on function public.desistir_interesse(text) to authenticated;

-- quais destes lugares eu já disse "quero trabalhar aqui" (o botão abre já no estado certo)
create or replace function public.meus_interesses(p_cnpjs text[])
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select i.cnpj from privado.interesses_locais i
   where i.perfil_id = auth.uid() and i.desistiu_em is null and i.cnpj = any (p_cnpjs[1:500])
$$;
revoke execute on function public.meus_interesses(text[]) from public, anon;
grant execute on function public.meus_interesses(text[]) to authenticated;

select privado.migracao_aplicada('20270707120000_desistir_do_interesse');
