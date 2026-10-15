-- =====================================================================
-- Boas-vindas de quem presta serviço (diarista, pedreiro, manicure…)
--
-- A conta "Pessoa" serve para quem procura trabalho e para quem oferece
-- serviço, mas a jornada é outra: o prestador monta a vitrine. Ele recebe
-- este e-mail no lugar das boas-vindas de quem procura trabalho quando se
-- cadastra pela página de serviços, ou quando monta a primeira vitrine.
--
-- Rode depois de 20261015180000_servicos_pelo_admin.sql. Pode rodar de novo.
-- =====================================================================

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values (
  'boas_vindas_prestador', 'usuarios', 0, 'Boas-vindas: quem presta serviço',
  'Quando a pessoa se cadastra para oferecer serviços (ou monta a primeira vitrine). Explica como montar a vitrine e ser chamado.',
  array['nome', 'link'],
  '{{nome}}, monte a sua vitrine de serviços no Publike',
  'Oi, {{nome}}. Boas-vindas ao Publike!

No Publike, quem mora perto encontra o seu serviço e chama você direto no WhatsApp. É grátis: sem taxa, sem comissão e sem plano.

Para ser chamado mais vezes:

1. Escolha os serviços que você faz (até 8) e conte em poucas linhas o que está incluído e há quanto tempo você trabalha.
2. Coloque um preço de referência, como “a partir de R$ 150 a diária”. Quem procura costuma chamar quem mostra o preço.
3. Mostre fotos de trabalhos que você já fez. Nada de telefone, placa de carro ou rosto de cliente nas fotos.
4. Marque o seu bairro e as regiões que você atende. A busca mostra primeiro quem está mais perto.

Os serviços ficam 90 dias no ar. Salvar a vitrine de novo renova o prazo.

Lembre: o Publike nunca cobra para você aparecer na busca.',
  'Montar a minha vitrine'
)
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;


-- Quem se cadastrou pela página de serviços: troca as boas-vindas de quem
-- procura trabalho (ainda na fila) pelas de prestador. Chamada pelo site logo
-- depois do primeiro perfil.
create or replace function public.quero_oferecer_servicos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
begin
  if eu is null or not exists (select 1 from public.perfis p where p.id = eu and p.tipo = 'pessoa') then
    return;
  end if;
  if exists (select 1 from privado.fila_emails f where f.usuario_id = eu and f.modelo = 'boas_vindas_prestador') then
    return;
  end if;
  update privado.fila_emails f
     set modelo = 'boas_vindas_prestador',
         dados = f.dados || jsonb_build_object('caminho', '/painel/servicos')
   where f.usuario_id = eu and f.modelo = 'boas_vindas_pessoa' and f.status = 'pendente'
     and f.criado_em > now() - interval '1 hour';
  if not found then
    perform privado.enfileirar_email(eu, 'boas_vindas_prestador', jsonb_build_object('caminho', '/painel/servicos'));
  end if;
end
$$;
revoke execute on function public.quero_oferecer_servicos() from public, anon;
grant execute on function public.quero_oferecer_servicos() to authenticated;


-- Primeira vitrine montada pela própria pessoa: se ainda não recebeu, vão as
-- boas-vindas de prestador. Vitrine montada pela equipe não conta (o e-mail
-- de acesso já explica).
create or replace function privado.servico_boas_vindas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.autor_id is distinct from (select auth.uid())
     or current_setting('publike.pelo_admin', true) = '1'
     or not exists (select 1 from public.perfis p where p.id = new.autor_id and p.tipo = 'pessoa')
     or exists (select 1 from privado.fila_emails f
                 where f.usuario_id = new.autor_id and f.modelo = 'boas_vindas_prestador') then
    return null;
  end if;
  perform privado.enfileirar_email(new.autor_id, 'boas_vindas_prestador',
                                   jsonb_build_object('caminho', '/painel/servicos'));
  return null;
end
$$;

drop trigger if exists anuncios_boas_vindas_prestador on public.anuncios;
create trigger anuncios_boas_vindas_prestador
  after insert on public.anuncios
  for each row when (new.tipo = 'servico')
  execute function privado.servico_boas_vindas();
