mkdir -p build

# pandoc version 2.7.3
# pandoc \
/home/ryan/bin/pandoc-2.7.3/bin/pandoc \
    -f markdown+smart -t markdown-smart \
    -o build/index.html \
    --highlight-style tango \
    --filter pandoc-crossref \
    -s -t slidy \
    src/title.txt src/*.md

cp -r img build/
