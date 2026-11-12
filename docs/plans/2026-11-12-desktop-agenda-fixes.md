# Ajustes desktop da agenda e da conta

Escopo separado do agrupamento de controles mobile. Base da worktree: `112c7fb`.

| Item | Problema observado | Ajuste desta rodada | Estado |
|---|---|---|---|
| Clique no bloco livre | A sequência real de mouse na agenda semanal podia iniciar um rascunho e suprimir o clique do bloco. | Um clique simples abre diretamente o horário livre; o arrasto continua criando rascunho. Incluído teste da sequência `pointerdown` → `pointerup` → `click` no intervalo 20:10–22:00. | Implementado; teste bloqueado pela ausência de `@happy-dom/global-registrator` na worktree. |
| Quadrado noturno na visão geral | A pessoa relatou seleção duplicada ao clicar em blocos noturnos. | Incluído teste de um clique de mouse no quadrado noturno, esperando um único painel e um único bloco selecionado. A inspeção do fluxo atual não mostrou dois seletores para um clique parado no mesmo quadrado: o `pointerup` encerra o arrasto sem criar seleção quando origem e destino são iguais; o `click` seleciona a célula. | Diagnóstico inconclusivo sem executar o teste e reproduzir no navegador. |
| Texto “Não informado” | O valor pode quebrar em duas linhas no detalhe da sala. | Aplicado `whitespace-nowrap` aos valores curtos do cadastro e ao texto compacto. | Implementado; teste focal não executado. |
| Tema na barra lateral recolhida | Conta e botão de tema lado a lado excedem a largura da barra recolhida. | O rodapé passa a empilhar conta e tema quando a barra está recolhida em desktop. | Implementado; teste de classe acessível incluído, sem execução da suíte. |
| Item “Configurações” sem ação | O menu mostrava um item informativo sem navegação ou ação. | Removido o item e atualizado o rótulo acessível do avatar para “Conta de …”. A alternância de tema permanece no rodapé. | Implementado; teste de ausência do item incluído, sem execução da suíte. |

## Verificação

- `git diff --check`: passou.
- Biome focado nos sete arquivos alterados: passou após formatação.
- `bun test` não iniciou os casos: o setup interrompeu a execução porque a worktree não tem `node_modules` e não encontra `@happy-dom/global-registrator`. `bun install --offline` não tem os pacotes no cache.
- Nenhuma conferência visual em navegador foi concluída nesta worktree. A sequência do quadrado noturno ainda precisa ser conferida manualmente antes de afirmar que a duplicidade foi corrigida.
