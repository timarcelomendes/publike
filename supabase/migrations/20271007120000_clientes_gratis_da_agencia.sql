-- Os clientes da agência: 10 de graça, e o aviso às agências (26/11/2026; Marcelo: "se um cliente da Agência é
-- selecionado, o sistema define o endereço do cliente como referência de localização no mapa, a ideia é usar o endereço
-- mas não mostrar o nome do cliente, para algumas situações, para garantirmos a localização correta do local de
-- trabalho, que não é no endereço da agência. É preciso comunicar isso às agências, que dá pra adicionar os clientes
-- lá, bom limitarmos a 10 gratuitos"). Pode rodar de novo (o aviso sai uma vez só).
--
-- Em 26/11: 17 agências, 8 com clientes (no máximo 2 cada); das 31 vagas de agência em 30 dias, 17 saíram como
-- "Empresa confidencial", muitas sem cliente (no endereço da agência).
--
-- 1. No grátis, até 10 clientes na lista (os arquivados não contam); com o plano da agência, até os 500 de sempre.
-- 2. O e-mail `clientes_da_agencia` e o aviso no sino, uma vez, para as agências: cadastre os clientes com o endereço;
--    a vaga fica no lugar certo do mapa; com "Empresa confidencial", o nome não aparece.

do $$
declare
  f text;
  antes text;
begin
  f := pg_get_functiondef('public.clientes_agencia_antes_de_salvar()'::regprocedure);
  if strpos(f, 'limite_clientes_gratis') = 0 then
    antes := f;
    f := replace(f,
      '        using errcode = ''P0001'', hint = ''limite_clientes'';' || chr(10) || '    end if;' || chr(10),
      '        using errcode = ''P0001'', hint = ''limite_clientes'';' || chr(10) || '    end if;' || chr(10)
      || '    -- no grátis, 10 na lista (migração 20271007120000); o plano da agência tira o limite' || chr(10)
      || '    if new.agencia_id = usuario and not coalesce(public.meu_plano_agencia(), false)' || chr(10)
      || '       and (select count(*) from public.clientes_agencia c' || chr(10)
      || '             where c.agencia_id = new.agencia_id and c.arquivado_em is null) >= 10 then' || chr(10)
      || '      raise exception ''No grátis, a agência cadastra até 10 clientes. Arquive os que não usa ou assine o plano da agência para cadastrar mais.''' || chr(10)
      || '        using errcode = ''P0001'', hint = ''limite_clientes_gratis'';' || chr(10)
      || '    end if;' || chr(10));
    if f = antes then
      raise exception 'clientes_agencia_antes_de_salvar mudou: não achei o limite de 500';
    end if;
    execute f;
  end if;
end
$$;

-- os clientes de graça que ainda cabem (nulo: sem limite, com o plano)
create or replace function public.meus_clientes_gratis()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'limite', 10,
    'na_lista', (select count(*) from public.clientes_agencia c
                  where c.agencia_id = (select public.conta_atual()) and c.arquivado_em is null),
    'com_plano', coalesce(privado.agencia_com_plano((select public.conta_atual())), false))
$$;
revoke execute on function public.meus_clientes_gratis() from public, anon;
grant execute on function public.meus_clientes_gratis() to authenticated;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('clientes_da_agencia', 'usuarios', 67, 'Agências: os clientes no lugar certo do mapa',
     'Uma vez, para as agências (migração 20271007120000): cadastrar os clientes com o endereço, para a vaga ficar no lugar certo do mapa, com ou sem o nome (Empresa confidencial). 10 clientes de graça.',
     array['nome', 'link'],
     '{{nome}}, a vaga do seu cliente no lugar certo do mapa',
     E'Oi, {{nome}}.\n\nQuem procura emprego no Publike escolhe a vaga pela distância de casa. Quando a vaga sai com o endereço da agência, ela aparece no lugar errado do mapa e chega a quem mora longe do trabalho.\n\nCadastre os seus clientes em Clientes, com o endereço de cada um. Ao publicar, escolha o cliente: a vaga fica no endereço dele, no mapa e na distância de quem se candidata.\n\nQuer manter o nome do cliente em sigilo? Marque "Empresa confidencial": a vaga usa o endereço do cliente, mas quem procura vê só "Empresa confidencial".\n\nSão 10 clientes de graça. Com o plano da agência, sem limite.',
     'Cadastrar meus clientes')
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

-- o aviso, uma vez: o e-mail (pelas regras da fila) e o sino de cada agência
do $$
declare
  v_texto constant text := 'Agências: cadastre os seus clientes com o endereço. A vaga fica no lugar certo do mapa e, com “Empresa confidencial”, o nome não aparece. 10 clientes de graça.';
  v_link constant text := '/painel/clientes';
  total integer;
begin
  if exists (select 1 from privado.comunicados c where c.texto = v_texto) then
    return;
  end if;
  perform privado.enfileirar_email(p.id, 'clientes_da_agencia', jsonb_build_object('caminho', v_link))
     from public.perfis p
    where p.tipo = 'agencia' and (p.suspenso_ate is null or p.suspenso_ate <= now());
  insert into public.notificacoes (destinatario_id, tipo, texto, link)
  select p.id, 'comunicado', v_texto, v_link
    from public.perfis p
   where privado.recebe_comunicado('agencias', v_link, p.id);
  get diagnostics total = row_count;
  insert into privado.comunicados (publico, texto, link, total) values ('agencias', v_texto, v_link, total);
end
$$;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271007120000_clientes_gratis_da_agencia');
