mkdir -p build

# pandoc version 2.7.3
pandoc \
    --filter pandoc-crossref \
    --css templates/epub.css \
    --toc -N \
    -o build/output.epub \
    src/*.md
    # -f markdown+smart -t markdown-smart \
