"""Gera app/public/css/modo-escuro.css a partir das folhas de estilo do site.

Uso: python3 gerar_modo_escuro.py   (rode de novo sempre que mudar cores em algum .css)

Como funciona:
- Lê cada .css de app/public/css e cria, para cada regra com cor, a versão escura.
- Cada regra gerada só vale nas páginas que carregam aquele .css
  (html.a11y-dark:has(link[href$="/arquivo.css"]) ...), então uma regra
  de uma página não vaza para as outras.
- Fundos brancos/cinza e fundos pastel (ex.: verde-menta claro) escurecem;
  textos escuros (cinza ou verde da marca) clareiam. Cores fortes da marca
  (verde, dourado, vermelho) e o texto combinado com elas ficam como estão.
- Arquivos que já tratam o modo escuro (contêm "a11y-dark") são ignorados.
- Ajustes finos feitos à mão ficam em modo-escuro-manual.css.
"""
import colorsys
import glob
import os
import re
from collections import OrderedDict

RAIZ = os.path.dirname(os.path.abspath(__file__))
PASTA_CSS = os.path.join(RAIZ, "app", "public", "css")
IGNORAR = {"acessibilidade.css", "chat-ia.css", "modo-escuro.css", "modo-escuro-gerado.css",
           "modo-escuro-manual.css", "cpc-palette.css"}

# Selectors com fundo colorido definido em OUTRA regra/classe (não detectável) — não mexer no texto.
EXCECOES_TEXTO = {
    ("como-funciona.css", ".btn"),
}

# "background-color" que é ícone/traço sobre fundo colorido (ex.: barras do menu hambúrguer).
EXCECOES_BG = {
    ("header.css", ".hamburger span"),
}

NAMED = {"white": (255, 255, 255), "black": (0, 0, 0)}


def ler_variaveis(conteudo, base=None):
    """Variáveis de cor declaradas no arquivo (inclusive var() apontando para outra variável)."""
    variaveis = dict(base or {})
    declaradas = re.findall(r"(--[\w-]+)\s*:\s*([^;}]+)", re.sub(r'/\*.*?\*/', '', conteudo, flags=re.S))
    for _ in range(4):  # resolve encadeamentos como --teal: var(--brand-mint)
        for nome, valor in declaradas:
            valor = valor.strip()
            ref = re.fullmatch(r'var\(\s*(--[\w-]+)\s*(?:,\s*(#[0-9a-fA-F]{3,8}))?\s*\)', valor)
            if ref and ref.group(1) in variaveis:
                variaveis[nome] = variaveis[ref.group(1)]
            elif re.fullmatch(r'#[0-9a-fA-F]{3,8}', valor) or valor.lower() in ("white", "black"):
                variaveis[nome] = {"white": "#ffffff", "black": "#000000"}.get(valor.lower(), valor)
    return variaveis


with open(os.path.join(PASTA_CSS, "cpc-palette.css"), encoding="utf-8") as _f:
    PALETA = ler_variaveis(_f.read())
VARIAVEIS = dict(PALETA)  # trocado a cada arquivo processado


def hex_to_rgb(h):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    if len(h) not in (6, 8):
        return None
    try:
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return None


def rgb_to_hex(rgb):
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def luminancia(rgb):
    def canal(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (canal(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def is_grayscale(rgb, tol=10):
    return (max(rgb) - min(rgb)) <= tol


def com_hsl(rgb, saturacao_max, luz):
    h, l, s = colorsys.rgb_to_hls(*(c / 255 for c in rgb))
    r, g, b = colorsys.hls_to_rgb(h, luz, min(s, saturacao_max))
    return tuple(round(c * 255) for c in (r, g, b))


def extrair_cor(valor):
    valor = valor.strip().rstrip(';').replace("!important", "").strip()
    m = re.fullmatch(r'var\(\s*(--[\w-]+)\s*(?:,\s*(#[0-9a-fA-F]{3,8}))?\s*\)', valor)
    if m:
        if m.group(1) in VARIAVEIS:
            return hex_to_rgb(VARIAVEIS[m.group(1)])
        return hex_to_rgb(m.group(2)) if m.group(2) else None
    if re.fullmatch(r'#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}', valor):
        return hex_to_rgb(valor)
    return NAMED.get(valor.lower())


# ---------- Mapeamento claro -> escuro ----------
def fundo_vira_escuro(rgb):
    """Fundos neutros e pastel muito claros escurecem; cores fortes ficam."""
    if is_grayscale(rgb):
        if sum(rgb) / 3 < 140:
            return None  # cinza escuro já é um fundo escuro de propósito (ex.: faixa de destaque)
        # Usa a média para não inverter o leve tom do cinza (verde claro viraria roxo).
        v = round(26 + 210 * (255 - sum(rgb) / 3) / 255)
        return rgb_to_hex((max(v - 4, 0), v, max(v - 2, 0)))  # cinza escuro levemente esverdeado
    if luminancia(rgb) > 0.72:
        return rgb_to_hex(com_hsl(rgb, 0.22, 0.15))
    return None


def texto_vira_claro(rgb):
    """Textos escuros (cinza ou cor da marca) clareiam."""
    if is_grayscale(rgb, tol=24):  # quase-preto azulado/esverdeado conta como neutro
        if sum(rgb) / 3 >= 160:
            return None
        v = round(235 - (sum(rgb) / 3) * 0.45)
        return rgb_to_hex((v - 2, v, v - 1))
    if luminancia(rgb) < 0.2:
        return rgb_to_hex(com_hsl(rgb, 0.55, 0.78))
    return None


def borda_vira_escura(rgb):
    if is_grayscale(rgb):
        if sum(rgb) / 3 < 140:
            return None
        if sum(rgb) / 3 >= 250:
            return None  # borda branca pura -> destaque proposital
        v = round(40 + 190 * (255 - sum(rgb) / 3) / 255)
        return rgb_to_hex((v - 3, v, v - 2))
    if luminancia(rgb) > 0.6:
        return rgb_to_hex(com_hsl(rgb, 0.18, 0.28))
    return None


def remover_comentarios(conteudo):
    return re.sub(r'/\*.*?\*/', '', conteudo, flags=re.S)


def remover_media(conteudo):
    padrao = re.compile(r'@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}')
    return padrao.sub('', conteudo)


def extrair_ultima_cor_do_shorthand(valor):
    for tok in reversed(re.findall(r'var\([^)]*\)|\S+', valor.strip())):
        cor = extrair_cor(tok)
        if cor:
            return cor
    return None


PROP_BORDA = {"border-color", "border-top-color", "border-bottom-color",
              "border-left-color", "border-right-color"}
PROP_SHORTHAND_BORDA = {"border", "border-top", "border-bottom", "border-left", "border-right"}

regras_regex = re.compile(r'([^{}]+)\{([^{}]*)\}')

agrupado = OrderedDict()
log = []


def processar_conteudo(conteudo, nome_origem):
    varredura = remover_media(remover_comentarios(conteudo))

    for m in regras_regex.finditer(varredura):
        seletor = " ".join(m.group(1).split())
        corpo = m.group(2)
        if not seletor or seletor.startswith("@") or seletor.startswith(":root") or "%" in seletor \
                or seletor in ("from", "to"):
            continue

        declaracoes = [d.strip() for d in corpo.split(";") if d.strip()]

        # Fundo que continua colorido no escuro (verde, dourado...) ou desconhecido
        # (gradiente, imagem, var fora da paleta): o texto da regra foi pensado para ele.
        fundo_fixo = False
        for decl in declaracoes:
            prop, _, valor = decl.partition(":")
            prop = prop.strip().lower()
            if prop not in ("background", "background-color"):
                continue
            valor = valor.strip()
            if "url(" in valor:
                fundo_fixo = True
                continue
            if "gradient" in valor:
                cores = re.findall(r'var\([^)]*\)|#[0-9a-fA-F]{3,8}\b|\bwhite\b', valor)
                if not cores or not all(extrair_cor(c) and fundo_vira_escuro(extrair_cor(c)) for c in cores):
                    fundo_fixo = True
                continue
            cor_bg = extrair_cor(valor) if prop == "background-color" or len(valor.split()) == 1 \
                else extrair_ultima_cor_do_shorthand(valor)
            if cor_bg is None:
                if valor not in ("none", "transparent", "inherit", "initial", "unset") and not valor.startswith("rgba"):
                    fundo_fixo = True
            elif fundo_vira_escuro(cor_bg) is None:
                fundo_fixo = True

        overrides = {}
        for decl in declaracoes:
            if ":" not in decl:
                continue
            prop, _, valor = decl.partition(":")
            prop = prop.strip().lower()
            valor = valor.strip()
            novo = None

            if prop in ("background-color", "background"):
                if (nome_origem, seletor) in EXCECOES_BG or "url(" in valor:
                    continue
                if "gradient" in valor:
                    # Gradiente só de cores claras (ex.: fundo da tela de login): escurece cada cor.
                    cores = re.findall(r'var\([^)]*\)|#[0-9a-fA-F]{3,8}\b|\bwhite\b', valor)
                    escuras = [fundo_vira_escuro(extrair_cor(c)) if extrair_cor(c) else None for c in cores]
                    if cores and all(escuras):
                        novo_gradiente = valor
                        for original, escura in zip(cores, escuras):
                            novo_gradiente = novo_gradiente.replace(original, escura, 1)
                        overrides["background"] = novo_gradiente
                        log.append(f"{nome_origem}: {seletor} {{ background -> {novo_gradiente} }}")
                    continue
                cor = extrair_cor(valor) if len(valor.split()) == 1 or valor.startswith("var(") else None
                if cor:
                    novo, prop_final = fundo_vira_escuro(cor), "background-color"
            elif prop in PROP_BORDA or prop in PROP_SHORTHAND_BORDA:
                cor = extrair_cor(valor) if prop in PROP_BORDA else extrair_ultima_cor_do_shorthand(valor)
                if cor:
                    novo = borda_vira_escura(cor)
                    prop_final = prop if prop in PROP_BORDA else ("border-color" if prop == "border" else prop + "-color")
            elif prop == "color":
                cor = extrair_cor(valor)
                if cor and not fundo_fixo and (nome_origem, seletor) not in EXCECOES_TEXTO:
                    novo, prop_final = texto_vira_claro(cor), "color"

            if novo:
                overrides[prop_final] = novo
                log.append(f"{nome_origem}: {seletor} {{ {prop_final} -> {novo} }}")

        if overrides:
            agrupado.setdefault((nome_origem, seletor), {}).update(overrides)


for caminho in sorted(glob.glob(os.path.join(PASTA_CSS, "*.css"))):
    nome = os.path.basename(caminho)
    if nome in IGNORAR:
        continue
    with open(caminho, encoding="utf-8") as f:
        conteudo = f.read()
    if "a11y-dark" in conteudo:
        print(f"ignorado (já trata o modo escuro): {nome}")
        continue
    VARIAVEIS = ler_variaveis(conteudo, PALETA)
    processar_conteudo(conteudo, nome)

print(f"Declarações convertidas: {len(log)} em {len(agrupado)} seletores")


def prefixar_seletor(sel, arquivo):
    escopo = f'html.a11y-dark:has(link[href$="/{arquivo}"])'
    novas = []
    for p in (p.strip() for p in sel.split(",")):
        if p.startswith("html"):
            novas.append(escopo + p[4:])
        else:
            novas.append(f"{escopo} {p}")
    return ", ".join(novas)


linhas = [
    "/* Arquivo GERADO por gerar_modo_escuro.py - não editar à mão (ajustes vão em modo-escuro-manual.css).",
    "   Cada regra só vale nas páginas que carregam o .css de origem. */",
    "",
]
arquivo_atual = None
for (nome, seletor), props in agrupado.items():
    if nome != arquivo_atual:
        arquivo_atual = nome
        linhas.append(f"\n/* origem: {nome} */")
    decls = " ".join(f"{p}: {v} !important;" for p, v in props.items())
    linhas.append(f"{prefixar_seletor(seletor, nome)} {{ {decls} }}")

# Variáveis neutras de páginas que usam var(--nome) próprio (fora da paleta).
linhas.append("""
/* origem: variáveis CSS (:root) - resumo-troca.css */
html.a11y-dark:has(link[href$="/resumo-troca.css"]) {
    --bg-page: #1b1d1c;
    --bg-card: #242826;
    --text-dark: #e6ebe8;
    --text-mid: #c3ccc6;
    --text-light: #a7b2ab;
    --border: #3a443e;
}

/* origem: variáveis CSS (:root) - contato-troca.css
   (--color-text-light fica: é o texto do botão laranja "Iniciar Troca") */
html.a11y-dark:has(link[href$="/contato-troca.css"]) {
    --color-text-dark: #e6ebe8;
}
""")

saida = os.path.join(PASTA_CSS, "modo-escuro.css")
with open(saida, "w", encoding="utf-8") as f:
    f.write("\n".join(linhas).rstrip() + "\n")
print(f"Gerado: {os.path.relpath(saida, RAIZ)}")
