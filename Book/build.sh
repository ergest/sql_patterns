pandoc chap*.md -o output/book.pdf --from markdown --toc --indented-code-classes=sql --highlight-style=monochrome -V mainfont="Palatino" -V documentclass=report -V papersize=A5 -V geometry:margin=1in

  #--template eisvogel --listings