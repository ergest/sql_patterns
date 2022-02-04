Query decomposition is a process by which you break down large, complex queries into smaller building blocks. Analysts have the tendency to solve the entire query in one go, join all the tables you need and do all the calculations without any abstraction.

There are two ways to approach query decomposition: top down and bottom up.

These blocks should have the following properties:
1. They are simple and single-purpose. A block should not try to do too much. It should ideally reduce the number of rows you're working on to just the ones needed

These building blocks should follow the