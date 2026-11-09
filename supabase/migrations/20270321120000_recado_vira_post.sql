-- O recado da linha do tempo vira "post" (09/11/2026; claude/plano-posts-e-conquistas.md, parte 1). Pode rodar de novo.
--
-- Só muda o texto que chega à pessoa: as mensagens de erro, os motivos da moderação e os avisos do sino que as
-- funções escrevem ("Seu recado está no ar" vira "Seu post está no ar"). Os nomes no banco ficam (recados,
-- recado_forcas, escrever_recado...): trocar é arriscado e ninguém vê. "Recado" continua valendo para a mensagem
-- a alguém (o pedido de conexão, o convite), que não passa por estas funções.
--
-- Em vez de copiar cada função inteira, lê a versão que está no banco e troca as frases. Os avisos que já
-- saíram ficam como estão.

do $$
declare
  f record;
  def text;
  novo text;
  trocas text[][] := array[
    ['Entre na sua conta para escrever um recado.', 'Entre na sua conta para postar.'],
    ['Complete seu perfil antes de escrever um recado.', 'Complete seu perfil antes de postar.'],
    ['Complete o bairro no seu perfil para escrever um recado.', 'Complete o bairro no seu perfil para postar.'],
    ['Você já escreveu 5 recados nas últimas 24 horas. Dá para escrever de novo ', 'Você já fez 5 posts nas últimas 24 horas. Dá para postar de novo '],
    ['Escreva o recado.', 'Escreva o post.'],
    ['Escreva o motivo para quem escreveu o recado.', 'Escreva o motivo para quem escreveu o post.'],
    ['Tire o telefone, o e-mail ou o link do recado.', 'Tire o telefone, o e-mail ou o link do post.'],
    ['Não dá para dar Força no próprio recado.', 'Não dá para dar Força no próprio post.'],
    ['Recado não encontrado.', 'Post não encontrado.'],
    ['Entre na sua conta para editar o recado.', 'Entre na sua conta para editar o post.'],
    ['Esse recado', 'Esse post'],
    ['esse recado', 'esse post'],
    ['Seu recado', 'Seu post'],
    ['ao seu recado', 'ao seu post'],
    ['O recado ', 'O post ']
  ];
  i int;
begin
  -- só as funções do post (o recado do pedido de conexão, do convite e das automações continua recado)
  for f in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname, p.proname) in (('public', 'escrever_recado'), ('public', 'editar_recado'),
                                      ('public', 'apagar_recado'), ('public', 'dar_forca'),
                                      ('public', 'denunciar_recado'), ('public', 'moderar_recado'),
                                      ('public', 'servidor_resultado_recado'), ('privado', 'motivo_do_recado'))
  loop
    def := pg_get_functiondef(f.oid);
    novo := def;
    for i in 1 .. array_length(trocas, 1) loop
      novo := replace(novo, trocas[i][1], trocas[i][2]);
    end loop;
    if novo is distinct from def then
      execute novo;
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';
