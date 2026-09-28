# Estoque do turno — posto

Sistema de estoque para gelo, carvão, ARLA 32, óleos e graxa.
O valor do turno fecha sozinho na contagem final.

## Login de teste

- `joao` / `123` — frentista
- `ana` / `123` — frentista
- `gerente` / `123` — gerente (histórico de todos, cadastros)

## Fluxo

1. Entrar
2. Abrir turno: preencher estoque inicial de cada produto
3. **Confirmar abertura** (grava os números; fechar só aparece depois)
4. Lançar entrada ou saída no meio do turno, se precisar
5. Fechar turno: contar o estoque final, senha, relatório

## Conta

```
vendido = inicial + entradas − estoque final
valor da linha = vendido × preço (preço travado na abertura)
total = soma das linhas, cada uma arredondada no centavo
```

Exemplo do João (total **R$ 2.535,58**):

| Produto | Inicial | Entrada | Final | Vendido | Preço | Valor |
|---|---:|---:|---:|---:|---:|---:|
| Gelo | 40 | 20 | 25 | 35 | 15,00 | 525,00 |
| Carvão | 25 | 10 | 17 | 18 | 18,00 | 324,00 |
| ARLA 32 | 200 | 100 | 154,5 | 145,5 | 4,29 | 624,20 |
| ATF Dexron III | 10 | 5 | 7,5 | 7,5 | 28,75 | 215,63 |

Gelo e carvão: só inteiro. ARLA e óleos: decimal.

Venda negativa não fecha sem usuário, senha e justificativa do gerente.

A contagem do meio do turno foi retirada: o caixa fecha só no estoque final.
O histórico mostra turnos fechados e cancelados, não o turno aberto.
